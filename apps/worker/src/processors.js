const { analyzeWorkbook, createXlsxWriter, readSheetRows, WorkbookLimitError } = require('../../../packages/excel-engine/src');
const { describeIssue } = require('../../../packages/template-engine/src/issues');
const { writeOutput, outputFileInfo } = require('../../../packages/excel-engine/src/output');
const { createSummaryAccumulator, orderedColumns, transformTemplateRow } = require('../../../packages/template-engine/src/run');
const { resolveTemplateForHeaders } = require('../../../packages/template-engine/src/mapping');
const { JOB_STATUSES } = require('../../../packages/shared/src/job-statuses');

class JobCancelledError extends Error {}

// Keeps temporary files alive for another TTL window, never beyond the hard limit from creation.
function extendedExpiry(job, limits, now = Date.now()) {
  if (!limits.tempFileTtlMs || !limits.hardTempFileTtlMs) return undefined;
  return new Date(Math.min(now + limits.tempFileTtlMs, new Date(job.createdAt).getTime() + limits.hardTempFileTtlMs));
}

// Only an unambiguous sheet is selected automatically; otherwise the user must choose.
function pickDefaultSheet(sheets) {
  const withData = sheets.filter((sheet) => sheet.rowCount > 0);
  return withData.length === 1 ? withData[0].name : null;
}

// Pure job processors. Infrastructure (PostgreSQL, Redis, BullMQ) is injected so they can be tested in isolation.
function createProcessors({ jobs, storage, publish, isCancelled, limits, progressIntervalMs = 250, log = () => {} }) {
  async function deleteFiles(...keys) {
    await Promise.all(keys.filter(Boolean).map((key) => storage.delete(key).catch(() => {})));
  }

  async function fail(job, error, eventType = 'job:failed') {
    const current = (await jobs.get(job.id)) || job;
    await jobs.update(job.id, {
      status: JOB_STATUSES.FAILED,
      stage: null,
      errorCode: error.code || 'INTERNAL_ERROR',
      errorMessage: error instanceof WorkbookLimitError ? error.message : 'Ocurrió un error inesperado al procesar el archivo.',
      purgedAt: new Date()
    });
    await deleteFiles(current.inputStorageKey, current.outputStorageKey, current.rejectsStorageKey);
    await publish(job.id, eventType);
  }

  // `headerRows` ({ sheetName: rowNumber }) re-analyzes with user-chosen header rows, keeping earlier choices.
  async function analyze(jobId, { headerRows = {} } = {}) {
    const job = await jobs.update(jobId, { status: JOB_STATUSES.ANALYZING, stage: 'ANALYZING', startedAt: new Date() }, {
      expectStatus: [JOB_STATUSES.QUEUED_ANALYSIS, JOB_STATUSES.ANALYZING]
    });
    if (!job) return;
    await publish(jobId, 'job:started');

    try {
      const overrides = { ...(job.workbookAnalysis?.headerRows || {}), ...headerRows };
      const { sheets } = await analyzeWorkbook(storage.resolvePath(job.inputStorageKey), { limits, sampleRows: limits.maxSampleRows, headerRows: overrides });
      const selectedSheet = job.selectedSheet && sheets.some((sheet) => sheet.name === job.selectedSheet) ? job.selectedSheet : pickDefaultSheet(sheets);
      const headers = sheets.find((sheet) => sheet.name === selectedSheet)?.headers || [];
      const updated = await jobs.update(jobId, {
        status: JOB_STATUSES.READY,
        stage: null,
        workbookAnalysis: { sheets, headerRows: overrides },
        selectedSheet,
        workingTemplate: job.workingTemplate ? resolveTemplateForHeaders(job.workingTemplate, headers) : null,
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

    const template = job.workingTemplate;
    const columns = orderedColumns(template);
    const sheet = job.workbookAnalysis.sheets.find((candidate) => candidate.name === job.selectedSheet);
    const summary = createSummaryAccumulator();
    const output = await storage.reserve({ extension: outputFileInfo(template.output).extension });
    const writesRejects = job.mode !== 'STRICT';
    let rejects = null;
    let lastReport = 0;

    // Rejected rows keep their original values so they can be fixed and reprocessed; created on first rejection.
    async function addReject(row, issues) {
      if (!rejects) {
        const reserved = await storage.reserve({ extension: 'xlsx' });
        rejects = { ...reserved, count: 0, writer: createXlsxWriter(reserved.path, { sheetName: 'RECHAZADAS', headers: ['Fila en el Excel', 'Problemas', ...sheet.headers] }) };
      }
      rejects.count += 1;
      const problems = issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.column}: ${describeIssue(issue)}`).join('; ');
      rejects.writer.addRow([row.rowNumber, problems, ...sheet.headers.map((header) => row.values[header] ?? null)]);
    }

    async function reportProgress(processed, force = false) {
      if (!force && Date.now() - lastReport < progressIntervalMs) return;
      lastReport = Date.now();
      if (await isCancelled(jobId)) throw new JobCancelledError();
      await jobs.update(jobId, { processedRows: processed, totalRows: sheet.rowCount });
      await publish(jobId, 'job:progress');
    }

    async function* outputRows() {
      let processed = 0;
      for await (const row of readSheetRows(storage.resolvePath(job.inputStorageKey), job.selectedSheet, { limits, headerRow: sheet.headerRow })) {
        const { output: values, issues } = transformTemplateRow(row.values, template);
        processed += 1;
        const isValid = summary.add(row.rowNumber, issues);
        if (isValid) yield columns.map((column) => values[column.outputName] ?? null);
        else if (writesRejects) await addReject(row, issues);
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
      await writeOutput(output.path, { output: template.output, columns, rows: outputRows() });
      if (rejects) await rejects.writer.close();
    } catch (error) {
      await deleteFiles(output.key, rejects?.key);
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
      rejectsStorageKey: rejects?.key || null,
      rejectedRows: rejects?.count || 0,
      validationSummary: result,
      totalRows: result.totalRows,
      processedRows: result.totalRows,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      completedAt: new Date(),
      ...(extendedExpiry(job, limits) ? { expiresAt: extendedExpiry(job, limits) } : {})
    }, { expectStatus: JOB_STATUSES.GENERATING });

    if (!completed) {
      // Cancelled between the last check and completion.
      await deleteFiles(output.key, rejects?.key);
      return;
    }
    await publish(jobId, 'job:completed');
  }

  async function cleanup(now = new Date()) {
    const expired = await jobs.findExpired(now);
    for (const job of expired) {
      const updated = await jobs.update(job.id, { status: JOB_STATUSES.EXPIRED, stage: null, purgedAt: now }, { expectStatus: job.status });
      if (!updated) continue;
      await deleteFiles(job.inputStorageKey, job.outputStorageKey, job.rejectsStorageKey);
      await publish(job.id, 'job:purged');
    }
    const { deleted } = await storage.cleanup(now);
    return { expired: expired.length, orphanFilesDeleted: deleted.length };
  }

  return { analyze, transform, cleanup, fail };
}

module.exports = { createProcessors };
