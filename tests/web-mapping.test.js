const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');

const loadMapping = () => import('../apps/web/lib/mapping.js');

const detected = [
  'RUT',
  'Nombre completo',
  'Remuneracion',
  'Periodo',
  'Fecha Inicio',
  'Fecha Termino',
  'AFP',
  'dias_licencia'
];

test('matches template sources to detected columns ignoring accents and case', async () => {
  const { findDetectedColumn } = await loadMapping();
  assert.equal(findDetectedColumn('Fecha Término', detected), 'Fecha Termino');
  assert.equal(findDetectedColumn('rut', detected), 'RUT');
  assert.equal(findDetectedColumn('base_utilizada', detected), null);
});

test('builds initial mapping keeping split rules and emptying unknown sources', async () => {
  const { createInitialMapping } = await loadMapping();
  const mapping = createInitialMapping(planVitalPagexTemplate.columns, detected);

  assert.deepEqual(mapping.rut, { type: 'COLUMN', column: 'RUT' });
  assert.deepEqual(mapping.apellido_paterno, { type: 'SPLIT_WORD', column: 'Nombre completo', index: 0 });
  assert.deepEqual(mapping.fecha_fin, { type: 'COLUMN', column: 'Fecha Termino' });
  assert.deepEqual(mapping.numero_licencia, { type: 'EMPTY' });
  assert.deepEqual(mapping.imponible_dias_licencia, { type: 'EMPTY' });
});

test('changing the source keeps the template rule type or clears it', async () => {
  const { updateMappingEntry } = await loadMapping();
  const [, apellido] = planVitalPagexTemplate.columns;
  const licencia = planVitalPagexTemplate.columns.find((column) => column.id === 'numero_licencia');

  assert.deepEqual(updateMappingEntry(apellido, 'AFP'), { type: 'SPLIT_WORD', column: 'AFP', index: 0 });
  assert.deepEqual(updateMappingEntry(apellido, ''), { type: 'EMPTY' });
  assert.deepEqual(updateMappingEntry(licencia, 'RUT'), { type: 'COLUMN', column: 'RUT' });
});

test('evaluates row status: missing, needs confirmation and ok', async () => {
  const { createInitialMapping, evaluateMapping, MAPPING_STATUS } = await loadMapping();
  const columns = planVitalPagexTemplate.columns;
  const mapping = createInitialMapping(columns, detected);
  const byId = (result) => Object.fromEntries(result.rows.map((row) => [row.column.id, row]));

  const initial = byId(evaluateMapping(columns, mapping, new Set()));
  assert.equal(initial.rut.status, MAPPING_STATUS.OK);
  assert.equal(initial.numero_licencia.status, MAPPING_STATUS.OK);
  assert.equal(initial.imponible_dias_licencia.status, MAPPING_STATUS.FALTANTE);
  assert.equal(initial.apellido_paterno.status, MAPPING_STATUS.REQUIERE_CONFIRMACION);
  assert.equal(initial.afp_origen.status, MAPPING_STATUS.REQUIERE_CONFIRMACION);
  assert.match(initial.afp_origen.reason, /AFP ACTUAL/);

  const confirmed = byId(evaluateMapping(columns, mapping, new Set(['apellido_paterno', 'afp_origen'])));
  assert.equal(confirmed.apellido_paterno.status, MAPPING_STATUS.OK);
  assert.equal(confirmed.afp_origen.status, MAPPING_STATUS.OK);
});

test('summarizes counts for blocking the next step', async () => {
  const { createInitialMapping, evaluateMapping } = await loadMapping();
  const columns = planVitalPagexTemplate.columns;
  const result = evaluateMapping(columns, createInitialMapping(columns, detected), new Set());

  assert.equal(result.counts.total, columns.length);
  assert.equal(result.counts.ok + result.counts.pending + result.counts.missing, columns.length);
  assert.equal(result.isComplete, false);
});
