const crypto = require('node:crypto');
const fs = require('node:fs');
const { JOB_STATUSES } = require('../../../../packages/shared/src/job-statuses');
const { readSheetRows } = require('../../../../packages/excel-engine/src');
const { createInitialMapping, evaluateMapping } = require('../../../../packages/template-engine/src/mapping');
const { runRows } = require('../../../../packages/template-engine/src/run');
const { cancelFlagKey } = require('../../../../packages/queue/src');
const { HttpError } = require('../http');
const { RUNNING_STATUSES, serializeJob, serializeTemplate, validateMappingPayload } = require('./job-view');
const { receiveUpload } = require('./upload');

const PREVIEW_ROWS = 5;
const CANCELLABLE = new Set([JOB_STATUSES.QUEUED_ANALYSIS, JOB_STATUSES.ANALYZING, ...RUNNING_STATUSES]);

function pad(value) {
  return String(value).padStart(2, '0');
}

function displayValue(value) {
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  return value;
}

function sourceColumns(mapping) {
  return new Set(Object.values(mapping).filter((entry) => entry.type !== 'EMPTY').map((entry) => entry.column));
}

function createJobService({ jobs, templates, storage, queues, redis, publish, config }) {
  async function view(job) {
    return serializeJob(job, await templates.getVersion(job.templateVersionId));
  }

  async function requireJob(jobId, user) {
    const job = /^[0-9a-f-]{36}$/i.test(jobId) ? await jobs.getForUser(jobId, user.id) : null;
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'El job no existe o no tienes acceso a él.');
    return job;
  }

  function requireStatus(job, statuses, message) {
    if (![].concat(statuses).includes(job.status)) throw new HttpError(409, 'INVALID_STATE', message);
  }

  function conflict() {
    return new HttpError(409, 'INVALID_STATE', 'El job cambió de estado. Recarga para ver la información actual.');
  }

  async function purgeFiles(job) {
    await Promise.all([job.inputStorageKey, job.outputStorageKey].filter(Boolean).map((key) => storage.delete(key).catch(() => {})));
  }

  return {
    async listTemplates() {
      return (await templates.listActive()).map(serializeTemplate);
    },

    async list(user) {
      return Promise.all((await jobs.listForUser(user.id)).map(view));
    },

    async get(jobId, user) {
      return view(await requireJob(jobId, user));
    },

    async create(request, user) {
      const { fields, file } = await receiveUpload(request, { storage, maxFileSizeBytes: config.maxFileSizeBytes });
      const template = fields.templateId ? await templates.getActive(fields.templateId).catch(() => null) : null;
      if (!template) {
        await storage.delete(file.key);
        throw new HttpError(400, 'TEMPLATE_NOT_FOUND', 'La plantilla seleccionada no existe.');
      }

      const job = await jobs.create({
        id: crypto.randomUUID(),
        userId: user.id,
        templateId: template.id,
        templateVersionId: template.versionId,
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
      requireStatus(job, JOB_STATUSES.READY, 'La hoja solo puede cambiarse antes de transformar.');
      const sheet = (job.workbookAnalysis?.sheets || []).find((candidate) => candidate.name === sheetName);
      if (!sheet) throw new HttpError(400, 'SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);

      const template = await templates.getVersion(job.templateVersionId);
      const updated = await jobs.update(job.id, {
        selectedSheet: sheet.name,
        mapping: createInitialMapping(template.columns, sheet.headers),
        confirmedIds: []
      }, { expectStatus: JOB_STATUSES.READY });
      if (!updated) throw conflict();
      await publish(job.id, 'job:stage');
      return view(updated);
    },

    async saveMapping(jobId, user, payload) {
      const job = await requireJob(jobId, user);
      requireStatus(job, JOB_STATUSES.READY, 'El mapeo solo puede cambiarse antes de transformar.');
      const template = await templates.getVersion(job.templateVersionId);
      const headers = job.workbookAnalysis.sheets.find((sheet) => sheet.name === job.selectedSheet)?.headers || [];
      const { mapping, confirmedIds } = validateMappingPayload(template, headers, payload);

      const updated = await jobs.update(job.id, { mapping, confirmedIds }, { expectStatus: JOB_STATUSES.READY });
      if (!updated) throw conflict();
      return view(updated);
    },

    // Rows are read from the temporary upload and returned to the owner only; nothing is stored.
    async preview(jobId, user) {
      const job = await requireJob(jobId, user);
      requireStatus(job, JOB_STATUSES.READY, 'La vista previa está disponible mientras el job se configura.');
      const template = await templates.getVersion(job.templateVersionId);

      const rows = [];
      for await (const row of readSheetRows(storage.resolvePath(job.inputStorageKey), job.selectedSheet, { limits: config })) {
        rows.push(row);
        if (rows.length >= PREVIEW_ROWS) break;
      }

      const used = sourceColumns(job.mapping);
      return {
        rows: runRows(rows, template, job.mapping).map((result, index) => ({
          rowNumber: result.rowNumber,
          input: Object.fromEntries(Object.entries(rows[index].values).filter(([header]) => used.has(header)).map(([header, value]) => [header, displayValue(value)])),
          output: result.output,
          issues: result.issues.map(({ column, rule, severity, code }) => ({ column, rule, severity, code }))
        }))
      };
    },

    async transform(jobId, user) {
      const job = await requireJob(jobId, user);
      requireStatus(job, JOB_STATUSES.READY, 'El job no está listo para transformar.');
      const template = await templates.getVersion(job.templateVersionId);
      if (!evaluateMapping(template.columns, job.mapping, new Set(job.confirmedIds)).isComplete) {
        throw new HttpError(409, 'MAPPING_INCOMPLETE', 'Resuelve el mapeo antes de transformar.');
      }

      const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
      const queued = await jobs.update(job.id, {
        status: JOB_STATUSES.QUEUED_TRANSFORMATION,
        stage: 'QUEUED',
        processedRows: 0,
        totalRows: sheet.rowCount,
        validationSummary: null
      }, { expectStatus: JOB_STATUSES.READY });
      if (!queued) throw conflict();

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
      if (!cancelled) throw conflict();

      // Waiting jobs are removed; an active one sees the cancel flag at its next progress check.
      await Promise.all([queues.analysis.remove(job.id), queues.transformation.remove(job.id)].map((removal) => removal.catch(() => {})));
      await purgeFiles(job);
      await publish(job.id, 'job:cancelled');
      return view(cancelled);
    },

    async download(jobId, user, response) {
      const job = await requireJob(jobId, user);
      requireStatus(job, JOB_STATUSES.READY_TO_DOWNLOAD, 'El archivo no está disponible para descarga.');
      const template = await templates.getVersion(job.templateVersionId);
      const filePath = storage.resolvePath(job.outputStorageKey);
      const baseName = job.fileName.replace(/\.xlsx$/i, '');
      const fileName = `${baseName}-${template.output?.sheetName || 'salida'}.xlsx`;

      response.writeHead(200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store'
      });

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
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
    },

    view
  };
}

module.exports = { createJobService };
