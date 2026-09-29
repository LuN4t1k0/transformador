const test = require('node:test');
const assert = require('node:assert/strict');
const { createTemplateService } = require('../apps/api/src/templates/service');

const id = '00000000-0000-0000-0000-0000000000aa';

function setup() {
  const deleted = [];
  const audited = [];
  const service = createTemplateService({
    templates: {
      getWithVersions: async (templateId) => (templateId === id && !deleted.includes(templateId) ? { id, name: 'Capital Aportes', versionId: 'v1', version: 3, versions: [] } : null),
      markDeleted: async (templateId) => deleted.push(templateId)
    },
    storage: {},
    config: {},
    audit: { record: async (event) => audited.push(event) }
  });
  return { service, deleted, audited };
}

test('a template is deleted only after typing «eliminar» or its exact name', async () => {
  const { service, deleted, audited } = setup();
  for (const confirmation of [undefined, '', 'si', 'Capital']) {
    await assert.rejects(service.remove(id, { confirmation }, { id: 'u1' }), { status: 400, code: 'CONFIRMATION_REQUIRED' });
  }
  assert.deepEqual(deleted, []);

  assert.deepEqual(await service.remove(id, { confirmation: '  capital aportes ' }, { id: 'u1' }), { deleted: true });
  assert.deepEqual(deleted, [id]);
  assert.deepEqual(audited.map((event) => [event.eventType, event.metadata.name]), [['TEMPLATE_DELETED', 'Capital Aportes']]);

  await assert.rejects(service.remove(id, { confirmation: 'eliminar' }, { id: 'u1' }), { status: 404 }, 'a deleted template no longer exists for the app');
});

test('the word «eliminar» also confirms, in any case', async () => {
  const { service, deleted } = setup();
  await service.remove(id, { confirmation: 'ELIMINAR' }, { id: 'u1' });
  assert.deepEqual(deleted, [id]);
});
