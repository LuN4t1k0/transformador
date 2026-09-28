const { HttpError } = require('../http');

const SPLIT_TYPES = new Set(['SPLIT_WORD', 'SPLIT_WORD_RANGE']);
const RUNNING_STATUSES = new Set(['QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING']);

function serializeTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    versionId: template.versionId,
    version: template.version,
    input: template.input,
    output: template.output,
    columns: template.columns
  };
}

// Public job shape: metadata only. Storage keys and owner ids never leave the API.
function serializeJob(job, template) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    fileName: job.fileName,
    fileSize: job.fileSizeBytes,
    templateId: job.templateId,
    template: template ? serializeTemplate(template) : null,
    mode: job.mode,
    sheets: job.workbookAnalysis?.sheets || [],
    selectedSheet: job.selectedSheet,
    mapping: job.mapping || {},
    confirmedIds: job.confirmedIds || [],
    progress: job.totalRows !== null && job.totalRows !== undefined && (RUNNING_STATUSES.has(job.status) || job.processedRows)
      ? { processed: job.processedRows, total: job.totalRows }
      : null,
    summary: job.validationSummary,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt
  };
}

function isNonNegativeInteger(value, max = 50) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

// Validates a mapping sent by the client against the template version and the selected sheet headers.
function validateMappingPayload(template, headers, payload) {
  if (!payload || typeof payload.mapping !== 'object' || payload.mapping === null || Array.isArray(payload.mapping)) {
    throw new HttpError(400, 'INVALID_MAPPING', 'El mapeo enviado no es válido.');
  }

  const columnIds = new Set(template.columns.map((column) => column.id));
  const headerSet = new Set(headers);
  const mapping = {};

  for (const id of Object.keys(payload.mapping)) {
    if (!columnIds.has(id)) throw new HttpError(400, 'INVALID_MAPPING', `La columna «${id}» no pertenece a la plantilla.`);
  }

  for (const column of template.columns) {
    const entry = payload.mapping[column.id] || { type: 'EMPTY' };
    const fail = (reason) => new HttpError(400, 'INVALID_MAPPING', `Mapeo inválido para «${column.outputName}»: ${reason}.`);

    if (entry.type === 'EMPTY') {
      mapping[column.id] = { type: 'EMPTY' };
      continue;
    }
    if (entry.type !== 'COLUMN' && !SPLIT_TYPES.has(entry.type)) throw fail('tipo de origen no soportado');
    if (!headerSet.has(entry.column)) throw fail(`la columna «${entry.column}» no existe en la hoja`);

    if (entry.type === 'COLUMN') {
      mapping[column.id] = { type: 'COLUMN', column: entry.column };
    } else if (entry.type === 'SPLIT_WORD') {
      if (!isNonNegativeInteger(entry.index)) throw fail('índice de palabra inválido');
      mapping[column.id] = { type: 'SPLIT_WORD', column: entry.column, index: entry.index };
    } else {
      if (!isNonNegativeInteger(entry.start) || (entry.end !== undefined && !isNonNegativeInteger(entry.end))) throw fail('rango de palabras inválido');
      mapping[column.id] = { type: 'SPLIT_WORD_RANGE', column: entry.column, start: entry.start, ...(entry.end !== undefined ? { end: entry.end } : {}) };
    }
  }

  const confirmedIds = [...new Set(Array.isArray(payload.confirmedIds) ? payload.confirmedIds : [])];
  if (confirmedIds.some((id) => !columnIds.has(id))) throw new HttpError(400, 'INVALID_MAPPING', 'Hay confirmaciones para columnas desconocidas.');

  return { mapping, confirmedIds };
}

module.exports = { serializeJob, serializeTemplate, validateMappingPayload, RUNNING_STATUSES };
