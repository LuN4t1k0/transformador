const { analyzeWorkbook, readSheetRows, writeWorkbook, WorkbookLimitError } = require('../../../packages/excel-engine/src');
const { transformRow } = require('../../../packages/template-engine/src/engine');
const { createInitialMapping } = require('../../../packages/template-engine/src/mapping');
const { buildEffectiveTemplate, createSummaryAccumulator, orderedColumns } = require('../../../packages/template-engine/src/run');
const { JOB_STATUSES } = require('../../../packages/shared/src/job-statuses');

class JobCancelledError extends Error {}

function pickDefaultSheet(sheets, template) {
  const preferred = sheets.find((sheet) => sheet.name === template.input?.sheet && sheet.rowCount > 0);
  return (preferred || sheets.find((sheet) => sheet.rowCount > 0) || sheets[0])?.name || null;
}

// Pure job processors. Infrastructure (PostgreSQL, Redis, BullMQ) is injected so they can be tested in isolation.
function createProcessors({ jobs, templates, storage, publish, isCancelled, limits, progressIntervalMs = 250, log = () => {} }) {
  async function deleteFiles(...keys) {
    await Promise.all(keys.filter(Boolean).map((key) => storage.delete(key).catch(() => {})));
  }

  async function fail(job, error, eventType = 'job:failed') {
    await jobs.update(job.id, {
      status: JOB_STATUSES.FAILED,
      stage: null,
      errorCode: error.code || 'INTERNAL_ERROR',
      errorMessage: error instanceof WorkbookLimitError ? error.message : 'Ocurrió un error inesperado al procesar el archivo.',
      purgedAt: new Date()
    });
    await deleteFiles(job.inputStorageKey, job.outputStorageKey);
    await publish(job.id, eventType);
  }

  async function analyze(jobId) {
    const job = await jobs.update(jobId, { status: JOB_STATUSES.ANALYZING, stage: 'ANALYZING', startedAt: new Date() }, {
      expectStatus: [JOB_STATUSES.QUEUED_ANALYSIS, JOB_STATUSES.ANALYZING]
    });
    if (!job) return;
    await publish(jobId, 'job:started');

    try {
      const template = await templates.getVersion(job.templateVersionId);
      const { sheets } = await analyzeWorkbook(storage.resolvePath(job.inputStorageKey), { limits, sampleRows: limits.maxSampleRows });
      const selectedSheet = pickDefaultSheet(sheets, template);
      const headers = sheets.find((sheet) => sheet.name === selectedSheet)?.headers || [];

      const updated = await jobs.update(jobId, {
        status: JOB_STATUSES.READY,
        stage: null,
        workbookAnalysis: { sheets },
        selectedSheet,
        mapping: createInitialMapping(template.columns, headers),
        confirmedIds: []
      }, { expectStatus: JOB_STATUSES.ANALYZING });
      if (updated) await publish(jobId, 'job:stage');
    } catch (error) {
      if (!(error instanceof WorkbookLimitError)) throw error;
      await fail(job, error);
    }
  }

  async function transform(jobId) {
    const job = await jobs.update(jobId, { status: JOB_STATUSES.TRANSFORMING, stage: 'TRANSFORMING', processedRows: 0 }, {
      expectStatus: [JOB_STATUSES.QUEUED_TRANSFORMATION, JOB_STATUSES.TRANSFORMING]
    });
    if (!job) return;
    await publish(jobId, 'job:started');

    const template = await templates.getVersion(job.templateVersionId);
    const effectiveTemplate = buildEffectiveTemplate(template, job.mapping);
    const columns = orderedColumns(template);
    const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
    const summary = createSummaryAccumulator();
    const output = await storage.reserve({ extension: 'xlsx' });
    let lastReport = 0;

    async function reportProgress(processed, force = false) {
      if (!force && Date.now() - lastReport < progressIntervalMs) return;
      lastReport = Date.now();
      if (await isCancelled(jobId)) throw new JobCancelledError();
      await jobs.update(jobId, { processedRows: processed, totalRows: sheet.rowCount });
      await publish(jobId, 'job:progress');
    }

    async function* outputRows() {
      let processed = 0;
      for await (const row of readSheetRows(storage.resolvePath(job.inputStorageKey), job.selectedSheet, { limits })) {
        const { output: values, issues } = transformRow(row.values, effectiveTemplate);
        processed += 1;
        const isValid = summary.add(row.rowNumber, issues);
        if (isValid) yield columns.map((column) => values[column.outputName] ?? null);
        await reportProgress(processed);
      }
      await reportProgress(processed, true);

      await jobs.update(jobId, { status: JOB_STATUSES.VALIDATING, stage: 'VALIDATING' });
      await publish(jobId, 'job:stage');
      if (job.mode === 'STRICT' && summary.result().errorCount > 0) {
        const error = new WorkbookLimitError('VALIDATION_FAILED', 'Hay filas con errores y el modo estricto no permite excluirlas.');
        throw error;
      }
      await jobs.update(jobId, { status: JOB_STATUSES.GENERATING, stage: 'GENERATING' });
      await publish(jobId, 'job:stage');
    }

    try {
      await writeWorkbook(output.path, {
        sheetName: template.output?.sheetName || 'DATOS',
        headers: columns.map((column) => column.outputName),
        rows: outputRows()
      });
    } catch (error) {
      await deleteFiles(output.key);
      if (error instanceof JobCancelledError) {
        log({ event: 'transformation:cancelled', jobId });
        return;
      }
      if (!(error instanceof WorkbookLimitError)) throw error;
      const result = summary.result();
      await jobs.update(jobId, { validationSummary: result, errorCount: result.errorCount, warningCount: result.warningCount });
      await fail(job, error);
      return;
    }

    const result = summary.result();
    const completed = await jobs.update(jobId, {
      status: JOB_STATUSES.READY_TO_DOWNLOAD,
      stage: null,
      outputStorageKey: output.key,
      validationSummary: result,
      totalRows: result.totalRows,
      processedRows: result.totalRows,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      completedAt: new Date()
    }, { expectStatus: JOB_STATUSES.GENERATING });

    if (!completed) {
      // Cancelled between the last check and completion.
      await deleteFiles(output.key);
      return;
    }
    await publish(jobId, 'job:completed');
  }

  async function cleanup(now = new Date()) {
    const expired = await jobs.findExpired(now);
    for (const job of expired) {
      const updated = await jobs.update(job.id, { status: JOB_STATUSES.EXPIRED, stage: null, purgedAt: now }, { expectStatus: job.status });
      if (!updated) continue;
      await deleteFiles(job.inputStorageKey, job.outputStorageKey);
      await publish(job.id, 'job:purged');
    }
    const { deleted } = await storage.cleanup(now);
    return { expired: expired.length, orphanFilesDeleted: deleted.length };
  }

  return { analyze, transform, cleanup, fail };
}

module.exports = { createProcessors };
