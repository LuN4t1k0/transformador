const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate, parseDate, transformNumber } = require('../packages/transformations/src');
const { formatRut } = require('../packages/packs/chile/rut');
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

test('parses numbers with automatic or explicit decimal separator', () => {
  const { parseNumber } = require('../packages/transformations/src/number');
  const cases = [
    ['1234.56', 1234.56], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1.234', 1234], ['1.234.567', 1234567],
    ['1,5', 1.5], ['1,234,567', 1234567], ['12.5', 12.5], ['$ 1.500', 1500], ['-2.500', -2500], [' 7 ', 7], ['abc', null], ['1.2.3', null], [42, 42]
  ];
  for (const [input, expected] of cases) assert.equal(parseNumber(input), expected, String(input));
  assert.equal(parseNumber('1.234', { decimalSeparator: '.' }), 1.234);
  assert.equal(parseNumber('1,234', { decimalSeparator: ',' }), 1.234);
  assert.equal(parseNumber('1,234', { decimalSeparator: '.' }), 1234);
});

test('values that cannot be converted are reported instead of silently emptied', () => {
  const { transformRow } = require('../packages/template-engine/src/engine');
  const template = {
    columns: [
      { id: 'f', position: 1, outputName: 'FECHA', required: false, source: { type: 'COLUMN', column: 'F' }, transformations: [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD/MM/YYYY' }] },
      { id: 'm', position: 2, outputName: 'MONTO', required: true, source: { type: 'COLUMN', column: 'M' }, transformations: [{ type: 'NUMBER', fixedDecimals: 2 }] },
      { id: 'r', position: 3, outputName: 'RUT', required: false, source: { type: 'COLUMN', column: 'R' }, transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' }] },
      { id: 'e', position: 4, outputName: 'VACIA', required: false, source: { type: 'COLUMN', column: 'E' }, transformations: [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD/MM/YYYY' }] }
    ]
  };
  const result = transformRow({ F: '31-02-2024', M: 'n/a', R: '12-ABC', E: null }, template);
  assert.deepEqual(result.issues.map((issue) => `${issue.column}:${issue.code}`), ['FECHA:INVALID_DATE', 'MONTO:INVALID_NUMBER', 'RUT:INVALID_RUT_FORMAT']);
  assert.equal(transformRow({ F: '03-05-2024', M: '1234.56', R: '12.345.678-5', E: '' }, template).output.MONTO, '1234.56');
});

test('reads written percentages and can write fractions back as percentages', () => {
  const { parseNumber } = require('../packages/transformations/src/number');
  assert.equal(parseNumber('0,69%'), 0.0069);
  assert.equal(parseNumber('10%'), 0.1);
  assert.equal(transformNumber(0.0069, { percent: true, fixedDecimals: 2, decimalSeparator: ',' }), '0,69%');
});
