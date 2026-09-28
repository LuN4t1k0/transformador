const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { runRows } = require('../packages/template-engine/src/run');
const { detectFormat, inferTemplate } = require('../packages/template-engine/src/infer');

const inputHeaders = ['RUT', 'Nombre completo', 'Remuneracion', 'Periodo', 'Fecha Inicio', 'Fecha Término', 'AFP', 'dias_licencia', 'dias_pagados', 'base_utilizada', 'monto_rem_dias', 'aporte_pension', 'total_aporte_afp'];
const people = [
  ['12.345.678-5', 'soto perez juan carlos', 850000, '202405', '03-05-2024', '09-05-2024', 'PlanVital', 7, 23, 790000, 198333, 19833, 20100],
  ['9.876.543-3', 'diaz rojas ana', 640000, '202404', '10-04-2024', '14-04-2024', 'Capital', 5, 25, 600000, 106667, 10667, 10900],
  ['15.678.901-1', 'muñoz silva pedro', 1120000, '202403', '01-03-2024', '30-03-2024', 'Habitat', 30, 0, 1100000, 0, 0, 0],
  ['7.654.321-6', 'vera toro luisa', 975000, '202402', '12-02-2024', '16-02-2024', 'Modelo', 5, 24, 950000, 162500, 16250, 16700]
];
const inputRows = people.map((values, index) => ({ rowNumber: index + 2, values: Object.fromEntries(inputHeaders.map((header, column) => [header, values[column]])) }));

function outputExample(template) {
  const results = runRows(inputRows, template);
  const headers = template.columns.map((column) => column.outputName);
  return { headers, rows: results.map((result, index) => ({ rowNumber: index + 2, values: result.output })) };
}

test('detects output formats from example values', () => {
  assert.deepEqual(detectFormat(['123456785', '98765433']).rut, 'NO_DOTS_NO_DASH');
  assert.deepEqual(detectFormat(['12.345.678-5', '9.876.543-3']).rut, 'DOTS_DASH');
  assert.equal(detectFormat(['03/05/2024', '10/04/2024']).date, 'DD/MM/YYYY');
  assert.equal(detectFormat(['20240503', '20240410']).date, 'YYYYMMDD');
  assert.equal(detectFormat(['202405', '202404']).date, 'YYYYMM');
  assert.equal(detectFormat([7, 5, 30]).number.integer, true);
  assert.equal(detectFormat(['1234,50', '99,10']).number.decimalSeparator, ',');
  assert.equal(detectFormat(['SOTO', 'DIAZ']).textCase, 'UPPERCASE');
  assert.equal(detectFormat(['01', '01', '01']).constant, '01');
});

test('learns the PlanVital template from an input file and an output example', () => {
  const seed = validateTemplateConfig(planVitalPagexTemplate);
  const { template, report } = inferTemplate({
    input: { headers: inputHeaders, rows: inputRows },
    output: { headers: outputExample(seed).headers, rows: outputExample(seed).rows, sheet: 'DATOS' }
  });
  const byName = Object.fromEntries(template.columns.map((column) => [column.outputName, column]));

  assert.equal(template.columns.length, 17);
  assert.deepEqual(byName.RUT.source, { type: 'COLUMN', column: 'RUT' });
  assert.deepEqual(byName.RUT.transformations, [{ type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' }]);
  assert.deepEqual(byName['APELLIDO PATERNO'].source, { type: 'SPLIT_WORD', column: 'Nombre completo', index: 0 });
  assert.deepEqual(byName['APELLIDO MATERNO'].source, { type: 'SPLIT_WORD', column: 'Nombre completo', index: 1 });
  assert.deepEqual(byName.NOMBRE.source, { type: 'SPLIT_WORD_RANGE', column: 'Nombre completo', start: 2 });
  assert.ok(byName.NOMBRE.transformations.some((t) => t.operation === 'UPPERCASE'));
  assert.deepEqual(byName.PERIODO.source, { type: 'COLUMN', column: 'Periodo' });
  assert.deepEqual(byName.PERIODO.transformations, [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD/MM/YYYY' }]);
  assert.deepEqual(byName['FEC. FIN'].source, { type: 'COLUMN', column: 'Fecha Término' });
  assert.deepEqual(byName['IMPONIBLE DIAS LICENCIA'].source, { type: 'COLUMN', column: 'base_utilizada' });
  assert.deepEqual(byName.TOTAL.source, { type: 'COLUMN', column: 'total_aporte_afp' });
  assert.deepEqual(byName['N.º LICENCIA'].source, { type: 'EMPTY' });
  assert.equal(template.output.sheetName, 'DATOS');

  // AFP ORIGEN / AFP ACTUAL both come from AFP; the learned split columns are marked as reviewed.
  assert.deepEqual(byName['AFP ORIGEN'].source, { type: 'COLUMN', column: 'AFP' });
  assert.equal(byName['APELLIDO PATERNO'].reviewed, true);
  assert.equal(report.learned, 16);
  assert.deepEqual(report.unresolved, ['N.º LICENCIA']);

  // The learned template reproduces the example exactly.
  const reproduced = runRows(inputRows, validateTemplateConfig(template));
  assert.deepEqual(reproduced.map((row) => row.output), outputExample(seed).rows.map((row) => row.values));
});

test('detects constant columns and falls back to header names without an input', () => {
  const { template } = inferTemplate({
    output: { headers: ['TIPO', 'RUT'], rows: [{ values: { TIPO: '01', RUT: '123456785' } }, { values: { TIPO: '01', RUT: '98765433' } }] }
  });
  assert.deepEqual(template.columns[0].source, { type: 'CONSTANT', value: '01' });
  assert.deepEqual(template.columns[1].source, { type: 'COLUMN', column: 'RUT' });
});

test('with only an input file, starts with one column per header', () => {
  const { template, report } = inferTemplate({ input: { headers: ['RUT', 'Nombre'], rows: [] }, sheet: 'Hoja1' });
  assert.deepEqual(template.columns.map((column) => column.source), [{ type: 'COLUMN', column: 'RUT' }, { type: 'COLUMN', column: 'Nombre' }]);
  assert.equal(report.mode, 'INPUT_ONLY');
});
