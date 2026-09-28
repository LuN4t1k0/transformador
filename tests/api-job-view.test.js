const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { serializeJob, validateMappingPayload } = require('../apps/api/src/jobs/job-view');
const { createRouter } = require('../apps/api/src/http');

const headers = ['RUT', 'Nombre completo', 'AFP'];

test('validates mapping against template columns and sheet headers', () => {
  const result = validateMappingPayload(planVitalPagexTemplate, headers, {
    mapping: {
      rut: { type: 'COLUMN', column: 'RUT', extra: 'ignored' },
      apellido_paterno: { type: 'SPLIT_WORD', column: 'Nombre completo', index: 0 },
      nombre: { type: 'SPLIT_WORD_RANGE', column: 'Nombre completo', start: 2 }
    },
    confirmedIds: ['apellido_paterno', 'apellido_paterno']
  });

  assert.deepEqual(result.mapping.rut, { type: 'COLUMN', column: 'RUT' });
  assert.deepEqual(result.mapping.periodo, { type: 'EMPTY' });
  assert.deepEqual(result.confirmedIds, ['apellido_paterno']);
});

test('rejects unknown columns, headers, source types and confirmations', () => {
  const invalid = [
    { mapping: { desconocida: { type: 'EMPTY' } } },
    { mapping: { rut: { type: 'COLUMN', column: 'No existe' } } },
    { mapping: { rut: { type: 'CONSTANT', value: 'x' } } },
    { mapping: { rut: { type: 'SPLIT_WORD', column: 'RUT', index: -1 } } },
    { mapping: {}, confirmedIds: ['otra'] },
    { mapping: null }
  ];
  for (const payload of invalid) {
    assert.throws(() => validateMappingPayload(planVitalPagexTemplate, headers, payload), { code: 'INVALID_MAPPING' });
  }
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
  }, { id: 't1', name: 'PlanVital', columns: [] });

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
