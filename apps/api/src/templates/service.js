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

function createTemplateService({ templates, audit = { record: async () => {} } }) {
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

    async setArchived(templateId, archived, user) {
      await requireTemplate(templateId);
      const updated = await templates.setArchived(templateId, archived).catch(translateNameConflict);
      await auditTemplate(updated, user, archived ? 'TEMPLATE_ARCHIVED' : 'TEMPLATE_UNARCHIVED');
      return serializeTemplateDetail(await templates.getWithVersions(templateId));
    }
  };
}

module.exports = { createTemplateService };
