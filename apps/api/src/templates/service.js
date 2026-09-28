const { TemplateNameTakenError } = require('../../../../packages/shared/src/repositories');
const { HttpError } = require('../http');
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

function createTemplateService({ templates }) {
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
      return serializeTemplateDetail(await templates.getWithVersions(created.id));
    },

    async addVersion(templateId, configuration, user) {
      requireActive(await requireTemplate(templateId));
      const valid = validateTemplatePayload(configuration);
      await templates.addVersion(templateId, valid, user.id).catch(translateNameConflict);
      return serializeTemplateDetail(await templates.getWithVersions(templateId));
    },

    async duplicate(templateId, { name }, user) {
      const source = await requireTemplate(templateId);
      const configuration = normalizeStoredTemplate(source);
      return this.create({ ...configuration, name: name || `${configuration.name} (copia)` }, user);
    },

    async setArchived(templateId, archived) {
      await requireTemplate(templateId);
      await templates.setArchived(templateId, archived).catch(translateNameConflict);
      return serializeTemplateDetail(await templates.getWithVersions(templateId));
    }
  };
}

module.exports = { createTemplateService };
