const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const {
  MAPPING_STATUS,
  findHeader,
  resolveTemplateForHeaders,
  evaluateColumns,
  matchTemplate,
  createTemplateFromHeaders,
  prepareVersionForSave
} = require('../packages/template-engine/src/mapping');

const seed = validateTemplateConfig(planVitalPagexTemplate);
const headers = ['RUT', 'Nombre completo', 'Remuneracion', 'Periodo', 'Fecha Inicio', 'Fecha Termino', 'AFP', 'dias_licencia', 'dias_pagados', 'base_utilizada', 'monto_rem_dias', 'aporte_pension', 'total_aporte_afp'];
const byId = (result) => Object.fromEntries(result.rows.map((row) => [row.column.id, row]));

test('finds headers by exact name, normalized name or alias', () => {
  assert.equal(findHeader('Fecha Término', headers), 'Fecha Termino');
  assert.equal(findHeader('rut', headers), 'RUT');
  assert.equal(findHeader('Rut trabajador', headers, ['Rut Trabajador', 'rut']), 'RUT');
  assert.equal(findHeader('Otra', headers), null);
});

test('resolves template sources against the sheet headers', () => {
  const resolved = resolveTemplateForHeaders(seed, headers);
  const columns = Object.fromEntries(resolved.columns.map((column) => [column.id, column]));
  assert.deepEqual(columns.fecha_fin.source, { type: 'COLUMN', column: 'Fecha Termino' });
  assert.deepEqual(columns.apellido_paterno.source, { type: 'SPLIT_WORD', column: 'Nombre completo', index: 0 });
  assert.deepEqual(columns.numero_licencia.source, { type: 'EMPTY' });
});

test('evaluates missing, pending confirmation and ok columns', () => {
  const resolved = resolveTemplateForHeaders(seed, headers.filter((header) => header !== 'base_utilizada'));
  const rows = byId(evaluateColumns(resolved.columns, headers.filter((header) => header !== 'base_utilizada'), new Set()));

  assert.equal(rows.rut.status, MAPPING_STATUS.OK);
  assert.equal(rows.numero_licencia.status, MAPPING_STATUS.OK);
  assert.equal(rows.imponible_dias_licencia.status, MAPPING_STATUS.FALTANTE);
  assert.match(rows.imponible_dias_licencia.reason, /base_utilizada/);
  assert.equal(rows.apellido_paterno.status, MAPPING_STATUS.REQUIERE_CONFIRMACION);
  assert.equal(rows.afp_origen.status, MAPPING_STATUS.REQUIERE_CONFIRMACION);
  assert.match(rows.afp_origen.reason, /AFP ACTUAL/);

  const confirmed = byId(evaluateColumns(resolved.columns, headers, new Set(['apellido_paterno', 'afp_origen'])));
  assert.equal(confirmed.apellido_paterno.status, MAPPING_STATUS.OK);
  assert.equal(confirmed.afp_origen.status, MAPPING_STATUS.OK);
});

test('optional columns with a missing header stay empty with a note; constants and concat are checked', () => {
  const columns = validateTemplateConfig({
    name: 'T',
    columns: [
      { id: 'a', outputName: 'A', required: false, source: { type: 'COLUMN', column: 'No existe' } },
      { id: 'b', outputName: 'B', required: true, source: { type: 'CONSTANT', value: '' } },
      { id: 'c', outputName: 'C', required: true, source: { type: 'CONCAT', parts: [{ type: 'COLUMN', column: 'RUT' }, { type: 'COLUMN', column: 'Falta' }] } }
    ]
  }).columns;
  const rows = byId(evaluateColumns(columns, headers, new Set()));
  assert.equal(rows.a.status, MAPPING_STATUS.OK);
  assert.match(rows.a.note, /vacía/);
  assert.equal(rows.b.status, MAPPING_STATUS.FALTANTE);
  assert.equal(rows.c.status, MAPPING_STATUS.FALTANTE);
});

test('scores how well a template matches a sheet', () => {
  assert.deepEqual(matchTemplate(seed, headers), { matched: 16, total: 16, requiredMissing: 0 });
  assert.deepEqual(matchTemplate(seed, ['RUT', 'Periodo']), { matched: 2, total: 16, requiredMissing: 14 });
});

test('creates a template from headers with one column per header', () => {
  const template = validateTemplateConfig(createTemplateFromHeaders(['RUT', 'Nombre', 'RUT'], { sheet: 'Hoja1' }));
  assert.deepEqual(template.columns.map((column) => column.outputName), ['RUT', 'Nombre', 'RUT (2)']);
  assert.deepEqual(template.columns[1].source, { type: 'COLUMN', column: 'Nombre' });
  assert.equal(template.input.sheet, 'Hoja1');
});

test('remembers previous header names as aliases when saving a version', () => {
  const base = seed;
  const working = resolveTemplateForHeaders(seed, headers);
  const saved = prepareVersionForSave(base, working);
  const fechaFin = saved.columns.find((column) => column.id === 'fecha_fin');
  assert.deepEqual(fechaFin.source, { type: 'COLUMN', column: 'Fecha Termino' });
  assert.deepEqual(fechaFin.aliases, ['Fecha Término']);
  assert.deepEqual(saved.columns.find((column) => column.id === 'rut').aliases, []);
});

test('reviewed columns do not ask for confirmation again, and saving marks confirmed ones as reviewed', () => {
  const working = resolveTemplateForHeaders(seed, headers);
  const saved = prepareVersionForSave(seed, working, ['apellido_paterno', 'afp_origen']);
  assert.equal(saved.columns.find((column) => column.id === 'apellido_paterno').reviewed, true);
  assert.equal(saved.columns.find((column) => column.id === 'rut').reviewed, false);

  const rows = byId(evaluateColumns(saved.columns, headers, new Set()));
  assert.equal(rows.apellido_paterno.status, MAPPING_STATUS.OK);
  assert.equal(rows.apellido_materno.status, MAPPING_STATUS.REQUIERE_CONFIRMACION);
});
