const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');
const { serializeJob, validateWorkingTemplatePayload } = require('../apps/api/src/jobs/job-view');
const { createRouter } = require('../apps/api/src/http');

test('validates the working template and keeps only known confirmations', () => {
  const result = validateWorkingTemplatePayload({ template: planVitalPagexTemplate, confirmedIds: ['rut', 'rut', 'otra'] });
  assert.equal(result.template.columns.length, 17);
  assert.deepEqual(result.confirmedIds, ['rut']);
});

test('rejects invalid working templates as 400 errors', () => {
  assert.throws(() => validateWorkingTemplatePayload({ template: { name: 'x', columns: [] } }), { status: 400, code: 'INVALID_TEMPLATE' });
});

test('serializes jobs without storage keys or owner ids', () => {
  const view = serializeJob({
    id: 'j1',
    userId: 'u1',
    status: 'TRANSFORMING',
    inputStorageKey: 'secret-in.xlsx',
    outputStorageKey: 'secret-out.xlsx',
    totalRows: 10,
    processedRows: 4,
    workbookAnalysis: { sheets: [{ name: 'RESUMEN' }] },
    errorCode: null
  }, { id: 't1', name: 'PlanVital', columns: [], versionId: 'v1', version: 2 });

  assert.deepEqual(view.progress, { processed: 4, total: 10 });
  assert.deepEqual(view.sheets, [{ name: 'RESUMEN' }]);
  assert.equal(JSON.stringify(view).includes('secret'), false);
  assert.equal(JSON.stringify(view).includes('u1'), false);
});

test('router matches params and distinguishes 405 from 404', () => {
  const match = createRouter([['GET', '/jobs/:jobId', 'get'], ['PATCH', '/jobs/:jobId/sheet', 'sheet']]);
  assert.deepEqual(match('GET', '/jobs/abc'), { handler: 'get', params: { jobId: 'abc' } });
  assert.deepEqual(match('DELETE', '/jobs/abc'), { methodNotAllowed: true });
  assert.equal(match('GET', '/nope'), null);
});
