const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');
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
  assert.deepEqual(detectFormat(['123456785', '98765433']).pack.transformations, [{ type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' }]);
  assert.deepEqual(detectFormat(['12.345.678-5', '9.876.543-3']).pack.transformations, [{ type: 'RUT_FORMAT', format: 'DOTS_DASH' }]);
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
  assert.deepEqual(byName['APELLIDO PATERNO'].source, { type: 'NAME_PART', column: 'Nombre completo', order: 'SURNAMES_FIRST', part: 'PATERNAL' });
  assert.deepEqual(byName['APELLIDO MATERNO'].source, { type: 'NAME_PART', column: 'Nombre completo', order: 'SURNAMES_FIRST', part: 'MATERNAL' });
  assert.deepEqual(byName.NOMBRE.source, { type: 'NAME_PART', column: 'Nombre completo', order: 'SURNAMES_FIRST', part: 'NAMES' });
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

test('suggests sources by similar column names when rows do not correspond', () => {
  const { template, report } = inferTemplate({
    input: {
      headers: ['RUT', 'Nombre completo', 'Periodo', 'Fecha Inicio', 'Fecha Término', 'AFP', 'dias_licencia', 'dias_pagados', 'total_aporte_afp', 'comision_afp'],
      columns: [
        { header: 'RUT', semantic: { type: 'CHILEAN_RUT' }, physical: { type: 'STRING' } },
        { header: 'Fecha Inicio', semantic: { type: 'GENERIC_TEXT' }, physical: { type: 'DATE' } },
        { header: 'Fecha Término', semantic: { type: 'GENERIC_TEXT' }, physical: { type: 'DATE' } }
      ],
      rows: [{ rowNumber: 2, values: { RUT: '11.111.111-1', 'Nombre completo': 'OTRA PERSONA' } }]
    },
    output: {
      headers: ['RUT', 'APELLIDO NOMBRES', 'PERIODO', 'FEC.INICIO', 'FEC.FIN', 'DIAS LIC.', 'IMPONIBLE', 'TOTAL', 'AFP 1', 'OBSERVACIONES'],
      rows: [
        { values: { RUT: '13264112-9', 'APELLIDO NOMBRES': 'Alcaino Herrera Ana', PERIODO: 202604, 'FEC.INICIO': '27-04-2026', 'FEC.FIN': '29-04-2026', 'DIAS LIC.': 3, IMPONIBLE: 703932, TOTAL: 8053, 'AFP 1': 'Capital', OBSERVACIONES: 'Discontinua' } },
        { values: { RUT: '13744291-4', 'APELLIDO NOMBRES': 'Carpio Saavedra Eli', PERIODO: 202201, 'FEC.INICIO': '27-01-2022', 'FEC.FIN': '02-02-2022', 'DIAS LIC.': 7, IMPONIBLE: 807662, TOTAL: 9240, 'AFP 1': 'Capital', OBSERVACIONES: 'Discontinua' } }
      ]
    }
  });
  const byName = Object.fromEntries(template.columns.map((column) => [column.outputName, column]));
  assert.deepEqual(byName['FEC.INICIO'].source, { type: 'COLUMN', column: 'Fecha Inicio' });
  assert.deepEqual(byName['FEC.INICIO'].transformations, [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD-MM-YYYY' }]);
  assert.deepEqual(byName['FEC.FIN'].source, { type: 'COLUMN', column: 'Fecha Término' });
  assert.deepEqual(byName['DIAS LIC.'].source, { type: 'COLUMN', column: 'dias_licencia' });
  assert.deepEqual(byName['APELLIDO NOMBRES'].source, { type: 'COLUMN', column: 'Nombre completo' });
  assert.deepEqual(byName.TOTAL.source, { type: 'COLUMN', column: 'total_aporte_afp' });
  assert.deepEqual(byName['AFP 1'].source, { type: 'COLUMN', column: 'AFP' });
  assert.deepEqual(byName.RUT.transformations[0], { type: 'RUT_FORMAT', format: 'NO_DOTS_DASH' });
  assert.deepEqual(byName.OBSERVACIONES.source, { type: 'CONSTANT', value: 'Discontinua' });
  assert.deepEqual(byName.IMPONIBLE.source, { type: 'EMPTY' });
  assert.equal(report.alignment, 'NONE');
  assert.ok(report.suggested.includes('FEC.INICIO'));
  assert.deepEqual(report.unresolved, ['IMPONIBLE']);
});

test('aligns example rows by RUT when files list people in a different order', () => {
  const input = {
    headers: ['RUT', 'Nombre completo', 'Monto'],
    rows: [
      { rowNumber: 2, values: { RUT: '9.876.543-3', 'Nombre completo': 'DIAZ ROJAS ANA', Monto: 200 } },
      { rowNumber: 3, values: { RUT: '11.111.111-1', 'Nombre completo': 'NO ESTA EN SALIDA', Monto: 999 } },
      { rowNumber: 4, values: { RUT: '12.345.678-5', 'Nombre completo': 'SOTO PEREZ JUAN', Monto: 100 } },
      { rowNumber: 5, values: { RUT: '7.654.321-6', 'Nombre completo': 'VERA TORO LUISA', Monto: 300 } }
    ]
  };
  const output = {
    headers: ['RUT', 'PATERNO', 'VALOR'],
    rows: [
      { values: { RUT: '12345678-5', PATERNO: 'SOTO', VALOR: 100 } },
      { values: { RUT: '7654321-6', PATERNO: 'VERA', VALOR: 300 } },
      { values: { RUT: '15678901-1', PATERNO: 'MUÑOZ', VALOR: 555 } },
      { values: { RUT: '9876543-3', PATERNO: 'DIAZ', VALOR: 200 } }
    ]
  };
  const { template, report } = inferTemplate({ input, output });
  const byName = Object.fromEntries(template.columns.map((column) => [column.outputName, column]));
  assert.equal(report.alignment, 'KEY');
  assert.equal(report.alignmentKey, 'RUT');
  assert.deepEqual(byName.PATERNO.source, { type: 'NAME_PART', column: 'Nombre completo', order: 'SURNAMES_FIRST', part: 'PATERNAL' });
  assert.deepEqual(byName.VALOR.source, { type: 'COLUMN', column: 'Monto' });
  assert.equal(report.byName.VALOR.method, 'EXAMPLE');
});

test('a value repeated in many rows beats a similar column name', () => {
  const rows = [0.0144, 0.0144, 0.0144].map((value, index) => ({ values: { '% AFP': value, TOTAL: 100 + index } }));
  const { template } = inferTemplate({
    input: { headers: ['comision_afp', 'total_aporte_afp'], columns: [{ header: 'comision_afp', physical: { type: 'INTEGER' } }], rows: [] },
    output: { headers: ['% AFP', 'TOTAL'], rows }
  });
  assert.deepEqual(template.columns[0].source, { type: 'CONSTANT', value: '0.0144' });
  assert.deepEqual(template.columns[1].source, { type: 'COLUMN', column: 'total_aporte_afp' });
});

test('keeps destination percentages as numbers shown with the Excel percentage format', () => {
  const rows = [0.0069, 0.0145, 0.01].map((rate, index) => ({ rowNumber: index + 2, values: { RUT: `1111111${index}-1`, Tasa: rate } }));
  const { template } = inferTemplate({
    input: { headers: ['RUT', 'Tasa'], rows },
    output: { headers: ['RUT', '% AFP'], rows: rows.map((row) => ({ values: { RUT: row.values.RUT, '% AFP': row.values.Tasa } })), percentHeaders: ['% AFP'], sheet: 'DATOS' }
  });
  const column = template.columns.find((item) => item.outputName === '% AFP');
  assert.deepEqual(column.source, { type: 'COLUMN', column: 'Tasa' });
  assert.equal(column.cellFormat, 'PERCENT');
  assert.ok(!(column.transformations || []).some((item) => item.type === 'NUMBER'));
});
