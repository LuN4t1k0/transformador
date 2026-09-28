const { TemplateNameTakenError } = require('../../../../packages/shared/src/repositories');
const { HttpError } = require('../http');
const { buildExampleWorkbook } = require('../../../../packages/excel-engine/src/example');
const { analyzeWorkbook, readSheetRows } = require('../../../../packages/excel-engine/src');
const { inferTemplate } = require('../../../../packages/template-engine/src/infer');
const { receiveFiles } = require('../jobs/upload');

const DRAFT_ROWS = 30;
const PREVIEW_ROWS = 5;

function encodeCell(value) {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}

// Reads the sheet with most data rows (and its first rows) from an uploaded example.
async function readExample(storage, upload, limits) {
  const filePath = storage.resolvePath(upload.key);
  const { sheets } = await analyzeWorkbook(filePath, { limits, sampleRows: 50 });
  const sheet = [...sheets].sort((a, b) => b.rowCount - a.rowCount)[0];
  if (!sheet || !sheet.rowCount) throw new HttpError(400, 'EMPTY_EXAMPLE', `«${upload.fileName}» no tiene filas de datos.`);
  const rows = [];
  for await (const row of readSheetRows(filePath, sheet.name, { limits, headerRow: sheet.headerRow })) {
    rows.push(row);
    if (rows.length >= DRAFT_ROWS) break;
  }
  return { fileName: upload.fileName, sheet: sheet.name, sheets: sheets.map((candidate) => candidate.name), headers: sheet.headers, rows };
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
      const { files } = await receiveFiles(request, { storage, maxFileSizeBytes: config.maxFileSizeBytes, names: ['input', 'output'] });
      try {
        const input = files.input ? await readExample(storage, files.input, config) : null;
        const output = files.output ? await readExample(storage, files.output, config) : null;
        const { template, report } = inferTemplate({ input, output, sheet: input?.sheet });
        return {
          template: validateTemplatePayload(template),
          report,
          input: input ? {
            fileName: input.fileName,
            sheet: input.sheet,
            headers: input.headers,
            sampleRows: input.rows.slice(0, PREVIEW_ROWS).map((row) => ({ rowNumber: row.rowNumber, values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, encodeCell(value)])) }))
          } : null,
          output: output ? { fileName: output.fileName, sheet: output.sheet, headers: output.headers } : null
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
