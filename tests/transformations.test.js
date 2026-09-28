const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRut, formatDate, parseDate, transformNumber } = require('../packages/transformations/src');
const { resolveSource } = require('../packages/template-engine/src/engine');

test('formats RUT body and verifier separately', () => {
  assert.equal(formatRut('10.231.091-8', 'BODY'), '10231091');
  assert.equal(formatRut('10.231.091-8', 'DV'), '8');
  assert.equal(formatRut('5.126.663-K', 'DV'), 'K');
});

test('parses dates automatically from text, Excel cells and numbers', () => {
  const iso = (value) => parseDate(value, 'AUTO')?.toISOString().slice(0, 10) ?? null;
  assert.equal(iso('03-05-2024'), '2024-05-03');
  assert.equal(iso('3/5/2024'), '2024-05-03');
  assert.equal(iso('2024-05-03'), '2024-05-03');
  assert.equal(iso('20240503'), '2024-05-03');
  assert.equal(iso('202405'), '2024-05-01');
  assert.equal(iso(202405), '2024-05-01');
  assert.equal(iso(45415), '2024-05-03');
  assert.equal(iso(new Date(Date.UTC(2024, 4, 3))), '2024-05-03');
  assert.equal(iso('no es fecha'), null);
});

test('formats dates in every supported output format', () => {
  const value = '03-05-2024';
  const out = (outputFormat) => formatDate(value, { inputFormat: 'AUTO', outputFormat });
  assert.equal(out('DD/MM/YYYY'), '03/05/2024');
  assert.equal(out('DD-MM-YYYY'), '03-05-2024');
  assert.equal(out('YYYY-MM-DD'), '2024-05-03');
  assert.equal(out('YYYYMMDD'), '20240503');
  assert.equal(out('DDMMYYYY'), '03052024');
  assert.equal(out('YYYYMM'), '202405');
  assert.equal(out('MM/YYYY'), '05/2024');
  assert.equal(formatDate('20240503', { inputFormat: 'YYYYMMDD', outputFormat: 'DD/MM/YYYY' }), '03/05/2024');
});

test('formats numbers with a decimal separator', () => {
  assert.equal(transformNumber('1.234,5', { fixedDecimals: 2, decimalSeparator: ',' }), '1234,50');
  assert.equal(transformNumber(12.345, { round: 1, decimalSeparator: ',' }), '12,3');
  assert.equal(transformNumber(7, { integer: true }), 7);
});

test('concat skips empty parts and supports constants', () => {
  const row = { Nombre: 'ANA', Segundo: null, Apellido: 'ROJAS' };
  const source = {
    type: 'CONCAT',
    separator: ' ',
    parts: [{ type: 'COLUMN', column: 'Nombre' }, { type: 'COLUMN', column: 'Segundo' }, { type: 'COLUMN', column: 'Apellido' }, { type: 'CONSTANT', value: 'CL' }]
  };
  assert.equal(resolveSource(row, source), 'ANA ROJAS CL');
  assert.equal(resolveSource({}, { type: 'CONCAT', separator: '-', parts: [{ type: 'COLUMN', column: 'X' }] }), null);
});

test('VALID_RUT checks the source RUT even when the output keeps only body or verifier', () => {
  const { transformRow } = require('../packages/template-engine/src/engine');
  const template = {
    columns: [
      { id: 'b', position: 1, outputName: 'CUERPO', source: { type: 'COLUMN', column: 'RUT' }, transformations: [{ type: 'RUT_FORMAT', format: 'BODY' }], validations: [{ type: 'VALID_RUT' }] },
      { id: 'd', position: 2, outputName: 'DV', source: { type: 'COLUMN', column: 'RUT' }, transformations: [{ type: 'RUT_FORMAT', format: 'DV' }], validations: [{ type: 'VALID_RUT' }] }
    ]
  };
  assert.deepEqual(transformRow({ RUT: '10.231.091-8' }, template).issues, []);
  assert.deepEqual(transformRow({ RUT: '10.231.091-9' }, template).issues.map((issue) => issue.code), ['INVALID_RUT', 'INVALID_RUT']);
});
