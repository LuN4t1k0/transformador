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
const ACTIVE_STATUSES = [...CANCELLABLE];
const DOWNLOADABLE = [JOB_STATUSES.READY_TO_DOWNLOAD, JOB_STATUSES.DOWNLOADED];

// Dates cannot travel as JSON; they are tagged so the web can revive them before running the engine.
function encodeCell(value) {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}

function createJobService({ jobs, templates, templateService, storage, queues, redis, publish, config, audit = { record: async () => {}, listForJob: async () => [] } }) {
  function auditJob(job, user, eventType, metadata = {}) {
    return audit.record({ userId: user.id, jobId: job.id, templateId: job.templateId, templateVersionId: job.templateVersionId, eventType, metadata });
  }

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

  // Activity keeps a job's temporary files alive for another TTL window, never beyond the hard limit.
  function extendedExpiry(job) {
    return new Date(Math.min(Date.now() + config.tempFileTtlMs, new Date(job.createdAt).getTime() + config.hardTempFileTtlMs));
  }

  async function requireCapacity(user) {
    const active = await jobs.countActiveForUser(user.id, ACTIVE_STATUSES);
    if (active >= config.maxActiveJobsPerUser) {
      throw new HttpError(429, 'TOO_MANY_ACTIVE_JOBS', `Tienes ${active} procesos en curso. Espera a que terminen para iniciar otro.`);
    }
  }

  async function update(job, changes) {
    const updated = await jobs.update(job.id, { ...changes, expiresAt: extendedExpiry(job) }, { expectStatus: job.status });
    if (!updated) throw new HttpError(409, 'INVALID_STATE', 'El job cambió de estado. Recarga para ver la información actual.');
    return updated;
  }

  async function purgeFiles(job) {
    await Promise.all([job.inputStorageKey, job.outputStorageKey, job.rejectsStorageKey].filter(Boolean).map((key) => storage.delete(key).catch(() => {})));
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
      await requireCapacity(user);
      const { file, fields } = await receiveUpload(request, { storage, maxFileSizeBytes: config.maxFileSizeBytes });

      // Optional starting configuration, applied by the worker once the file is analyzed.
      let reuseFromJobId = null;
      let requestedTemplateId = null;
      try {
        if (fields.reuseFromJobId) reuseFromJobId = (await requireJob(fields.reuseFromJobId, user)).id;
        if (fields.templateId) requestedTemplateId = (await templateService.getActiveConfiguration(fields.templateId)).template.id;
      } catch (error) {
        await storage.delete(file.key);
        throw error;
      }

      const job = await jobs.create({
        id: crypto.randomUUID(),
        userId: user.id,
        templateId: null,
        templateVersionId: null,
        fileName: file.fileName,
        fileSizeBytes: file.size,
        inputStorageKey: file.key,
        status: JOB_STATUSES.QUEUED_ANALYSIS,
        expiresAt: new Date(Date.now() + config.tempFileTtlMs),
        reuseFromJobId,
        requestedTemplateId
      });

      try {
        await queues.analysis.add('analyze', { jobId: job.id }, { jobId: job.id });
      } catch (error) {
        await jobs.update(job.id, { status: JOB_STATUSES.FAILED, errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'No pudimos encolar el análisis.' });
        await storage.delete(file.key);
        throw error;
      }
      await auditJob(job, user, 'JOB_CREATED', { fileName: file.fileName, fileSizeBytes: file.size, reuseFromJobId, requestedTemplateId });
      await publish(job.id, 'job:queued');
      return view(job);
    },

    async activity(jobId, user) {
      const job = await requireJob(jobId, user);
      return audit.listForJob(job.id);
    },

    async selectSheet(jobId, user, { sheetName, headerRow }) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const sheet = (job.workbookAnalysis?.sheets || []).find((candidate) => candidate.name === sheetName);
      if (!sheet) throw new HttpError(400, 'SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);

      if (headerRow !== undefined && headerRow !== sheet.headerRow) {
        if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 1000) throw new HttpError(400, 'INVALID_HEADER_ROW', 'La fila de encabezados debe ser un número entre 1 y 1000.');
        // A different header row changes the headers: re-analyze in the worker.
        const queued = await update(job, { selectedSheet: sheet.name, status: JOB_STATUSES.QUEUED_ANALYSIS, stage: 'QUEUED' });
        await queues.analysis.add('analyze', { jobId: job.id, headerRows: { [sheet.name]: headerRow } }, { jobId: `${job.id}-h${Date.now()}` });
        await auditJob(job, user, 'HEADER_ROW_CHANGED', { sheet: sheet.name, headerRow });
        await publish(job.id, 'job:queued');
        return view(queued);
      }

      const updated = await update(job, {
        selectedSheet: sheet.name,
        workingTemplate: job.workingTemplate ? resolveTemplateForHeaders(job.workingTemplate, sheet.headers) : null,
        confirmedIds: []
      });
      await auditJob(updated, user, 'SHEET_SELECTED', { sheet: sheet.name });
      await publish(job.id, 'job:stage');
      return view(updated);
    },

    // Templates ranked for this sheet: full matches first, then the one this user used most recently.
    async templateMatches(jobId, user) {
      const job = await requireJob(jobId, user);
      const headers = selectedHeaders(job);
      const [list, lastUsed] = await Promise.all([templates.list(), jobs.lastUsedTemplates(user.id)]);
      const isFull = (match) => match.requiredMissing === 0 && match.matched === match.total;
      return list
        .map((template) => ({ templateId: template.id, lastUsedAt: lastUsed.get(template.id) || null, ...matchTemplate(normalizeStoredTemplate(template), headers) }))
        .sort((a, b) => (Number(isFull(b)) - Number(isFull(a)))
          || (new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0))
          || (a.requiredMissing - b.requiredMissing)
          || (b.matched / Math.max(b.total, 1) - a.matched / Math.max(a.total, 1)));
    },

    async applyTemplate(jobId, user, { templateId, blank }) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      const headers = selectedHeaders(job);

      if (blank) {
        const workingTemplate = validateTemplatePayload(createTemplateFromHeaders(headers, { sheet: job.selectedSheet }));
        const updated = await update(job, { templateId: null, templateVersionId: null, workingTemplate, confirmedIds: [] });
        await auditJob(updated, user, 'TEMPLATE_APPLIED', { blank: true });
        return view(updated);
      }

      const { template, configuration } = await templateService.getActiveConfiguration(templateId);
      const updated = await update(job, {
        templateId: template.id,
        templateVersionId: template.versionId,
        workingTemplate: resolveTemplateForHeaders(configuration, headers),
        confirmedIds: []
      });
      await auditJob(updated, user, 'TEMPLATE_APPLIED', { name: template.name, version: template.version });
      return view(updated);
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
        const updated = await update(job, { templateVersionId: saved.versionId, workingTemplate: validateTemplatePayload(configuration) });
        await auditJob(updated, user, 'TEMPLATE_SAVED_FROM_JOB', { mode, name: saved.name, version: saved.version });
        return view(updated);
      }

      if (mode === 'NEW_TEMPLATE') {
        const configuration = prepareVersionForSave(null, { ...working, name, destination, process, description }, job.confirmedIds);
        const saved = await templateService.create(configuration, user);
        const updated = await update(job, { templateId: saved.id, templateVersionId: saved.versionId, workingTemplate: validateTemplatePayload(configuration) });
        await auditJob(updated, user, 'TEMPLATE_SAVED_FROM_JOB', { mode, name: saved.name, version: saved.version });
        return view(updated);
      }

      throw new HttpError(400, 'INVALID_MODE', 'Indica si quieres guardar una nueva versión o una plantilla nueva.');
    },

    // Sample rows go only to the job owner and are never stored; the web runs the engine on them for live previews.
    async sample(jobId, user) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      selectedHeaders(job);

      const rows = [];
      const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
      for await (const row of readSheetRows(storage.resolvePath(job.inputStorageKey), job.selectedSheet, { limits: config, headerRow: sheet.headerRow })) {
        rows.push({ rowNumber: row.rowNumber, values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, encodeCell(value)])) });
        if (rows.length >= SAMPLE_ROWS) break;
      }
      return { rows };
    },

    async transform(jobId, user, { mode = 'LENIENT' } = {}) {
      const job = await requireJob(jobId, user);
      requireEditable(job);
      if (!['LENIENT', 'STRICT'].includes(mode)) throw new HttpError(400, 'INVALID_MODE', 'El modo de validación no es válido.');
      await requireCapacity(user);
      const headers = selectedHeaders(job);
      const template = requireWorkingTemplate(job);
      if (!evaluateColumns(template.columns, headers, new Set(job.confirmedIds)).isComplete) {
        throw new HttpError(409, 'MAPPING_INCOMPLETE', 'Resuelve las columnas pendientes antes de transformar.');
      }

      const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
      const queued = await update(job, {
        status: JOB_STATUSES.QUEUED_TRANSFORMATION,
        stage: 'QUEUED',
        mode,
        processedRows: 0,
        totalRows: sheet.rowCount,
        validationSummary: null
      });

      await redis.del(cancelFlagKey(job.id));
      await queues.transformation.add('transform', { jobId: job.id }, { jobId: job.id });
      await auditJob(queued, user, 'TRANSFORM_REQUESTED', { mode, rows: sheet.rowCount, sheet: sheet.name, outputFormat: template.output.format });
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
      await auditJob(job, user, 'JOB_CANCELLED', { previousStatus: job.status });
      await publish(job.id, 'job:cancelled');
      return view(cancelled);
    },

    async download(jobId, user, response, { file = 'output' } = {}) {
      const job = await requireJob(jobId, user);
      requireStatus(job, DOWNLOADABLE, 'El archivo ya no está disponible. Los archivos temporales se eliminan al expirar el job.');
      const baseName = job.fileName.replace(/\.xlsx$/i, '');
      let key;
      let fileName;
      let contentType;
      if (file === 'rejects') {
        if (!job.rejectsStorageKey) throw new HttpError(404, 'NOT_FOUND', 'Este job no tiene filas rechazadas.');
        key = job.rejectsStorageKey;
        fileName = `${baseName}-rechazadas.xlsx`;
        contentType = outputFileInfo({ format: 'XLSX' }).contentType;
      } else {
        const { output, name } = job.workingTemplate;
        const info = outputFileInfo(output);
        key = job.outputStorageKey;
        fileName = `${baseName}-${name}.${info.extension}`;
        contentType = info.contentType;
      }

      response.writeHead(200, {
        'content-type': contentType,
        'content-disposition': `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store'
      });

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(storage.resolvePath(key));
        stream.on('error', reject);
        response.on('finish', resolve);
        response.on('close', resolve);
        stream.pipe(response);
      });
      if (!response.writableFinished) return;
      await auditJob(job, user, 'FILE_DOWNLOADED', { file });

      // Files stay available for re-download until the job expires or the user purges them.
      if (file === 'output' && job.status === JOB_STATUSES.READY_TO_DOWNLOAD) {
        const downloaded = await jobs.update(job.id, { status: JOB_STATUSES.DOWNLOADED, downloadedAt: new Date() }, { expectStatus: JOB_STATUSES.READY_TO_DOWNLOAD });
        if (downloaded) await publish(job.id, 'job:stage');
      }
    },

    async purge(jobId, user) {
      const job = await requireJob(jobId, user);
      requireStatus(job, DOWNLOADABLE, 'Solo se pueden eliminar los archivos de un job terminado.');
      const purged = await jobs.update(job.id, { status: JOB_STATUSES.PURGED, purgedAt: new Date() }, { expectStatus: DOWNLOADABLE });
      if (!purged) throw new HttpError(409, 'INVALID_STATE', 'El job cambió de estado. Recarga para ver la información actual.');
      await purgeFiles(job);
      await auditJob(job, user, 'FILES_PURGED', {});
      await publish(job.id, 'job:purged');
      return view(purged);
    }
  };
}

module.exports = { createJobService };
