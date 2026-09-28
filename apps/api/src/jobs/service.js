const crypto = require('node:crypto');
const fs = require('node:fs');
const { JOB_STATUSES } = require('../../../../packages/shared/src/job-statuses');
const { readSheetRows } = require('../../../../packages/excel-engine/src');
const { outputFileInfo } = require('../../../../packages/excel-engine/src/output');
const {
  createTemplateFromHeaders,
  evaluateColumns,
  matchTemplate,
  prepareVersionForSave,
  resolveTemplateForHeaders
} = require('../../../../packages/template-engine/src/mapping');
const { cancelFlagKey } = require('../../../../packages/queue/src');
const { HttpError } = require('../http');
const { RUNNING_STATUSES, normalizeStoredTemplate, serializeJob, validateTemplatePayload, validateWorkingTemplatePayload } = require('./job-view');
const { receiveUpload } = require('./upload');

const SAMPLE_ROWS = 5;
const CANCELLABLE = new Set([JOB_STATUSES.QUEUED_ANALYSIS, JOB_STATUSES.ANALYZING, ...RUNNING_STATUSES]);

// Dates cannot travel as JSON; they are tagged so the web can revive them before running the engine.
function encodeCell(value) {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}

function createJobService({ jobs, templates, templateService, storage, queues, redis, publish, config }) {
  async function view(job) {
    return serializeJob(job, job.templateVersionId ? await templates.getVersion(job.templateVersionId) : null);
  }

  async function requireJob(jobId, user) {
    const job = /^[0-9a-f-]{36}$/i.test(jobId) ? await jobs.getForUser(jobId, user.id) : null;
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'El job no existe o no tienes acceso a él.');
    return job;
  }

  function requireStatus(job, statuses, message) {
    if (![].concat(statuses).includes(job.status)) throw new HttpError(409, 'INVALID_STATE', message);
  }

  function requireEditable(job) {
    requireStatus(job, JOB_STATUSES.READY, 'La configuración solo puede cambiarse antes de transformar.');
  }

  function selectedHeaders(job) {
    const sheet = (job.workbookAnalysis?.sheets || []).find((candidate) => candidate.name === job.selectedSheet);
    if (!sheet) throw new HttpError(409, 'SHEET_REQUIRED', 'Primero elige la hoja con la que quieres trabajar.');
    return sheet.headers;
  }

  function requireWorkingTemplate(job) {
    if (!job.workingTemplate) throw new HttpError(409, 'TEMPLATE_REQUIRED', 'Primero elige o crea una plantilla.');
    return job.workingTemplate;
  }

  async function update(job, changes) {
    const updated = await jobs.update(job.id, changes, { expectStatus: job.status });
    if (!updated) throw new HttpError(409, 'INVALID_STATE', 'El job cambió de estado. Recarga para ver la información actual.');
    return updated;
  }

  async function purgeFiles(job) {
    await Promise.all([job.inputStorageKey, job.outputStorageKey].filter(Boolean).map((key) => storage.delete(key).catch(() => {})));
  }

  return {
    view,

    async list(user) {
      return Promise.all((await jobs.listForUser(user.id)).map(view));
    },

    async get(jobId, user) {
      return view(await requireJob(jobId, user));
    },

    async create(request, user) {
      const { file } = await receiveUpload(request, { storage, maxFileSizeBytes: config.maxFileSizeBytes });
      const job = await jobs.create({
        id: crypto.randomUUID(),
        userId: user.id,
        templateId: null,
        templateVersionId: null,
        fileName: file.fileName,
        fileSizeBytes: file.size,
        inputStorageKey: file.key,
        status: JOB_STATUSES.QUEUED_ANALYSIS,
        expiresAt: new Date(Date.now() + config.tempFileTtlMs)
      });

      try {
        await queues.analysis.add('analyze', { jobId: job.id }, { jobId: job.id });
      } catch (error) {
        await jobs.update(job.id, { status: JOB_STATUSES.FAILED, errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'No pudimos encolar el análisis.' });
        await storage.delete(file.key);
        throw error;
      }
      await publish(job.id, 'job:queued');
      return view(job);
    },

    async selectSheet(jobId, user, { sheetName }) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const sheet = (job.workbookAnalysis?.sheets || []).find((candidate) => candidate.name === sheetName);
      if (!sheet) throw new HttpError(400, 'SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);

      const updated = await update(job, {
        selectedSheet: sheet.name,
        workingTemplate: job.workingTemplate ? resolveTemplateForHeaders(job.workingTemplate, sheet.headers) : null,
        confirmedIds: []
      });
      await publish(job.id, 'job:stage');
      return view(updated);
    },

    async templateMatches(jobId, user) {
      const job = await requireJob(jobId, user);
      const headers = selectedHeaders(job);
      const list = await templates.list();
      return list
        .map((template) => ({ templateId: template.id, ...matchTemplate(normalizeStoredTemplate(template), headers) }))
        .sort((a, b) => (a.requiredMissing - b.requiredMissing) || (b.matched / Math.max(b.total, 1) - a.matched / Math.max(a.total, 1)));
    },

    async applyTemplate(jobId, user, { templateId, blank }) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const headers = selectedHeaders(job);

      if (blank) {
        const workingTemplate = validateTemplatePayload(createTemplateFromHeaders(headers, { sheet: job.selectedSheet }));
        return view(await update(job, { templateId: null, templateVersionId: null, workingTemplate, confirmedIds: [] }));
      }

      const { template, configuration } = await templateService.getActiveConfiguration(templateId);
      return view(await update(job, {
        templateId: template.id,
        templateVersionId: template.versionId,
        workingTemplate: resolveTemplateForHeaders(configuration, headers),
        confirmedIds: []
      }));
    },

    async saveWorkingTemplate(jobId, user, payload) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      requireWorkingTemplate(job);
      const { template, confirmedIds } = validateWorkingTemplatePayload(payload);
      return view(await update(job, { workingTemplate: template, confirmedIds }));
    },

    // Persists the working configuration as a new version of the base template or as a brand new template.
    async saveTemplate(jobId, user, { mode, name, destination, process, description }) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const working = requireWorkingTemplate(job);

      if (mode === 'NEW_VERSION') {
        if (!job.templateId) throw new HttpError(409, 'TEMPLATE_REQUIRED', 'Esta configuración no tiene una plantilla base; guárdala como plantilla nueva.');
        const base = await templates.getVersion(job.templateVersionId);
        const configuration = prepareVersionForSave(normalizeStoredTemplate(base), working, job.confirmedIds);
        const saved = await templateService.addVersion(job.templateId, configuration, user);
        return view(await update(job, { templateVersionId: saved.versionId, workingTemplate: validateTemplatePayload(configuration) }));
      }

      if (mode === 'NEW_TEMPLATE') {
        const configuration = prepareVersionForSave(null, { ...working, name, destination, process, description }, job.confirmedIds);
        const saved = await templateService.create(configuration, user);
        return view(await update(job, { templateId: saved.id, templateVersionId: saved.versionId, workingTemplate: validateTemplatePayload(configuration) }));
      }

      throw new HttpError(400, 'INVALID_MODE', 'Indica si quieres guardar una nueva versión o una plantilla nueva.');
    },

    // Sample rows go only to the job owner and are never stored; the web runs the engine on them for live previews.
    async sample(jobId, user) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      selectedHeaders(job);

      const rows = [];
      for await (const row of readSheetRows(storage.resolvePath(job.inputStorageKey), job.selectedSheet, { limits: config })) {
        rows.push({ rowNumber: row.rowNumber, values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, encodeCell(value)])) });
        if (rows.length >= SAMPLE_ROWS) break;
      }
      return { rows };
    },

    async transform(jobId, user) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const headers = selectedHeaders(job);
      const template = requireWorkingTemplate(job);
      if (!evaluateColumns(template.columns, headers, new Set(job.confirmedIds)).isComplete) {
        throw new HttpError(409, 'MAPPING_INCOMPLETE', 'Resuelve las columnas pendientes antes de transformar.');
      }

      const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
      const queued = await update(job, {
        status: JOB_STATUSES.QUEUED_TRANSFORMATION,
        stage: 'QUEUED',
        processedRows: 0,
        totalRows: sheet.rowCount,
        validationSummary: null
      });

      await redis.del(cancelFlagKey(job.id));
      await queues.transformation.add('transform', { jobId: job.id }, { jobId: job.id });
      await publish(job.id, 'job:queued');
      return view(queued);
    },

    async cancel(jobId, user) {
      const job = await requireJob(jobId, user);
      if (!CANCELLABLE.has(job.status)) throw new HttpError(409, 'NOT_CANCELLABLE', 'El job no está en proceso.');

      await redis.set(cancelFlagKey(job.id), '1', 'EX', 24 * 60 * 60);
      const cancelled = await jobs.update(job.id, { status: JOB_STATUSES.CANCELLED, stage: null, purgedAt: new Date() }, { expectStatus: [...CANCELLABLE] });
      if (!cancelled) throw new HttpError(409, 'INVALID_STATE', 'El job cambió de estado. Recarga para ver la información actual.');

      // Waiting jobs are removed; an active one sees the cancel flag at its next progress check.
      await Promise.all([queues.analysis.remove(job.id), queues.transformation.remove(job.id)].map((removal) => removal.catch(() => {})));
      await purgeFiles(job);
      await publish(job.id, 'job:cancelled');
      return view(cancelled);
    },

    async download(jobId, user, response) {
      const job = await requireJob(jobId, user);
      requireStatus(job, JOB_STATUSES.READY_TO_DOWNLOAD, 'El archivo no está disponible para descarga.');
      const { output, name } = job.workingTemplate;
      const { extension, contentType } = outputFileInfo(output);
      const baseName = job.fileName.replace(/\.xlsx$/i, '');
      const fileName = `${baseName}-${name}.${extension}`;

      response.writeHead(200, {
        'content-type': contentType,
        'content-disposition': `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store'
      });

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(storage.resolvePath(job.outputStorageKey));
        stream.on('error', reject);
        response.on('finish', resolve);
        response.on('close', resolve);
        stream.pipe(response);
      });
      if (!response.writableFinished) return;

      // Delete-after-download policy: the output and the upload are purged once the file was sent.
      const downloaded = await jobs.update(job.id, { status: JOB_STATUSES.DOWNLOADED, downloadedAt: new Date() }, { expectStatus: JOB_STATUSES.READY_TO_DOWNLOAD });
      if (!downloaded) return;
      await publish(job.id, 'job:stage');
      await purgeFiles(job);
      await jobs.update(job.id, { status: JOB_STATUSES.PURGED, purgedAt: new Date() }, { expectStatus: JOB_STATUSES.DOWNLOADED });
      await publish(job.id, 'job:purged');
    }
  };
}

module.exports = { createJobService };
