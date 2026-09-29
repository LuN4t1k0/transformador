const { TemplateNameTakenError } = require('../../../../packages/shared/src/repositories');
const { HttpError } = require('../http');
const { buildExampleWorkbook } = require('../../../../packages/excel-engine/src/example');
const { analyzeWorkbook, pickTableSheet, readSheetRows } = require('../../../../packages/excel-engine/src');
const { inferTemplate } = require('../../../../packages/template-engine/src/infer');
const { receiveFiles } = require('../jobs/upload');

const DRAFT_ROWS = 30;
const PREVIEW_ROWS = 5;
const EXAMPLE_ROWS = 15;

const encodeRow = (headers) => (row) => ({ rowNumber: row.rowNumber, values: Object.fromEntries(headers.map((header) => [header, encodeCell(row.values[header] ?? null)])) });

function encodeCell(value) {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}

// Reads the main table of an uploaded example (or the sheet the user chose) and its first rows.
async function readExample(storage, upload, limits, requestedSheet) {
  const filePath = storage.resolvePath(upload.key);
  const { sheets } = await analyzeWorkbook(filePath, { limits, sampleRows: 50 });
  const sheet = sheets.find((candidate) => candidate.name === requestedSheet && candidate.rowCount > 0) || pickTableSheet(sheets);
  if (!sheet) throw new HttpError(400, 'EMPTY_EXAMPLE', `«${upload.fileName}» no tiene filas de datos.`);
  const rows = [];
  for await (const row of readSheetRows(filePath, sheet.name, { limits, headerRow: sheet.headerRow })) {
    rows.push(row);
    if (rows.length >= DRAFT_ROWS) break;
  }
  // In a destination example, hidden columns and unnamed, mostly empty columns are layout leftovers.
  const present = (header) => rows.filter((row) => row.values[header] !== null && row.values[header] !== undefined && String(row.values[header]).trim() !== '').length;
  const visibleHeaders = sheet.headers.filter((header) => !(sheet.hiddenHeaders || []).includes(header)
    && !(/^Columna [A-Z]+$/.test(header) && present(header) < rows.length / 2));
  return {
    fileName: upload.fileName,
    sheet: sheet.name,
    headerRow: sheet.headerRow,
    visibleHeaders,
    ignoredHeaders: sheet.headers.filter((header) => !visibleHeaders.includes(header)),
    sheets: sheets.filter((candidate) => candidate.rowCount > 0).map((candidate) => ({ name: candidate.name, rowCount: candidate.rowCount, columnCount: candidate.columnCount })),
    headers: sheet.headers,
    columns: sheet.columns,
    rows
  };
}
const {
  normalizeStoredTemplate,
  serializeTemplateDetail,
  serializeTemplateSummary,
  validateTemplatePayload
} = require('../jobs/job-view');

const UUID = /^[0-9a-f-]{36}$/i;

function translateNameConflict(error) {
  if (error instanceof TemplateNameTakenError) throw new HttpError(409, error.code, error.message);
  throw error;
}

function createTemplateService({ templates, storage, config, audit = { record: async () => {} } }) {
  function auditTemplate(template, user, eventType, metadata = {}) {
    return audit.record({ userId: user?.id, templateId: template.id, templateVersionId: template.versionId, eventType, metadata: { name: template.name, version: template.version, ...metadata } });
  }

  async function requireTemplate(templateId) {
    const template = UUID.test(templateId) ? await templates.getWithVersions(templateId) : null;
    if (!template) throw new HttpError(404, 'NOT_FOUND', 'La plantilla no existe.');
    return template;
  }

  function requireActive(template) {
    if (template.archivedAt) throw new HttpError(409, 'TEMPLATE_ARCHIVED', 'La plantilla está archivada. Restáurala para editarla.');
  }

  return {
    async list({ includeArchived }) {
      return (await templates.list({ includeArchived })).map(serializeTemplateSummary);
    },

    facets() {
      return templates.facets();
    },

    async get(templateId) {
      return serializeTemplateDetail(await requireTemplate(templateId));
    },

    async getVersion(templateId, versionId) {
      const template = await requireTemplate(templateId);
      if (!template.versions.some((version) => version.id === versionId)) throw new HttpError(404, 'NOT_FOUND', 'La versión no existe.');
      const version = await templates.getVersion(versionId);
      return serializeTemplateDetail({ ...version, id: template.id, versions: template.versions, archivedAt: template.archivedAt });
    },

    // Used by jobs: the active version normalized to the current schema.
    async getActiveConfiguration(templateId) {
      const template = UUID.test(templateId) ? await templates.getActive(templateId) : null;
      if (!template || template.archivedAt) throw new HttpError(404, 'NOT_FOUND', 'La plantilla no existe o está archivada.');
      return { template, configuration: normalizeStoredTemplate(template) };
    },

    async create(configuration, user) {
      const valid = validateTemplatePayload(configuration);
      const created = await templates.create(valid, user.id).catch(translateNameConflict);
      await auditTemplate(created, user, 'TEMPLATE_CREATED');
      return serializeTemplateDetail(await templates.getWithVersions(created.id));
    },

    async addVersion(templateId, configuration, user) {
      requireActive(await requireTemplate(templateId));
      const valid = validateTemplatePayload(configuration);
      const updated = await templates.addVersion(templateId, valid, user.id).catch(translateNameConflict);
      await auditTemplate(updated, user, 'TEMPLATE_VERSION_CREATED');
      return serializeTemplateDetail(await templates.getWithVersions(templateId));
    },

    async duplicate(templateId, { name }, user) {
      const source = await requireTemplate(templateId);
      const configuration = normalizeStoredTemplate(source);
      return this.create({ ...configuration, name: name || `${configuration.name} (copia)` }, user);
    },

    // Builds an unsaved template from example files: the input users receive and/or the output the destination
    // expects. Files are deleted right after reading; rows are only returned to the requester for previews.
    async draft(request) {
      const { files, fields } = await receiveFiles(request, { storage, maxFileSizeBytes: config.maxFileSizeBytes, names: ['input', 'output'] });
      try {
        const input = files.input ? await readExample(storage, files.input, config, fields.inputSheet) : null;
        const output = files.output ? await readExample(storage, files.output, config, fields.outputSheet) : null;
        const { template, report } = inferTemplate({ input, output: output ? { ...output, headers: output.visibleHeaders } : null, sheet: input?.sheet });
        return {
          template: validateTemplatePayload(template),
          report,
          input: input ? {
            fileName: input.fileName,
            sheet: input.sheet,
            sheets: input.sheets,
            headers: input.headers,
            sampleRows: input.rows.slice(0, PREVIEW_ROWS).map(encodeRow(input.headers)),
            exampleRows: input.rows.slice(0, EXAMPLE_ROWS).map(encodeRow(input.headers))
          } : null,
          output: output ? {
            fileName: output.fileName,
            sheet: output.sheet,
            sheets: output.sheets,
            headerRow: output.headerRow,
            headers: output.visibleHeaders,
            ignoredHeaders: output.ignoredHeaders,
            // For the template assistant, which checks its proposals against the destination example.
            exampleRows: output.rows.slice(0, EXAMPLE_ROWS).map(encodeRow(output.visibleHeaders))
          } : null
        };
      } finally {
        await Promise.all(Object.values(files).map((upload) => storage.delete(upload.key).catch(() => {})));
      }
    },

    async example(templateId) {
      const template = await requireTemplate(templateId);
      const configuration = normalizeStoredTemplate(template);
      return { fileName: `ejemplo-${template.name}.xlsx`, buffer: await buildExampleWorkbook(configuration) };
    },

    async setArchived(templateId, archived, user) {
      await requireTemplate(templateId);
      const updated = await templates.setArchived(templateId, archived).catch(translateNameConflict);
      await auditTemplate(updated, user, archived ? 'TEMPLATE_ARCHIVED' : 'TEMPLATE_UNARCHIVED');
      return serializeTemplateDetail(await templates.getWithVersions(templateId));
    }
  };
}

module.exports = { createTemplateService };
