const { HttpError } = require('../http');
const { validateTemplateConfig, TemplateValidationError } = require('../../../../packages/template-engine/src/schema');

const RUNNING_STATUSES = new Set(['QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING']);

function serializeTemplateSummary(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description || '',
    destination: template.destination || '',
    process: template.process || '',
    archivedAt: template.archivedAt || null,
    versionId: template.versionId,
    version: template.version,
    updatedAt: template.versionCreatedAt || null,
    updatedBy: template.versionCreatedBy || null,
    columnCount: template.columns?.length || 0,
    outputFormat: template.output?.format ? String(template.output.format).toUpperCase() : 'XLSX'
  };
}

function serializeTemplateDetail(template) {
  const configuration = normalizeStoredTemplate(template);
  return {
    ...serializeTemplateSummary(template),
    configuration: { input: configuration.input, output: configuration.output, columns: configuration.columns },
    versions: template.versions || []
  };
}

// Stored versions may predate the current schema (e.g. the original seed); normalize them on read.
function normalizeStoredTemplate(template) {
  return validateTemplateConfig({
    name: template.name,
    description: template.description,
    destination: template.destination,
    process: template.process,
    input: template.input,
    output: template.output,
    columns: template.columns
  });
}

// Public job shape: metadata only. Storage keys and owner ids never leave the API.
function serializeJob(job, baseTemplate) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    fileName: job.fileName,
    fileSize: job.fileSizeBytes,
    template: baseTemplate ? serializeTemplateSummary(baseTemplate) : null,
    workingTemplate: job.workingTemplate || null,
    mode: job.mode,
    sheets: job.workbookAnalysis?.sheets || [],
    selectedSheet: job.selectedSheet,
    confirmedIds: job.confirmedIds || [],
    progress: job.totalRows !== null && job.totalRows !== undefined && (RUNNING_STATUSES.has(job.status) || job.processedRows)
      ? { processed: job.processedRows, total: job.totalRows }
      : null,
    summary: job.validationSummary,
    files: ['READY_TO_DOWNLOAD', 'DOWNLOADED'].includes(job.status)
      ? { output: Boolean(job.outputStorageKey), rejects: Boolean(job.rejectsStorageKey), rejectedRows: job.rejectedRows || 0 }
      : null,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt
  };
}

function validateTemplatePayload(configuration) {
  try {
    return validateTemplateConfig(configuration);
  } catch (error) {
    if (error instanceof TemplateValidationError) throw new HttpError(400, error.code, error.message);
    throw error;
  }
}

function validateWorkingTemplatePayload(payload) {
  const template = validateTemplatePayload(payload?.template);
  const ids = new Set(template.columns.map((column) => column.id));
  const confirmedIds = [...new Set(Array.isArray(payload.confirmedIds) ? payload.confirmedIds : [])].filter((id) => ids.has(id));
  return { template, confirmedIds };
}

module.exports = {
  RUNNING_STATUSES,
  serializeJob,
  serializeTemplateSummary,
  serializeTemplateDetail,
  normalizeStoredTemplate,
  validateTemplatePayload,
  validateWorkingTemplatePayload
};
