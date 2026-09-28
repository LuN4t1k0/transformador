const test = require('node:test');
const assert = require('node:assert/strict');
const { transformRow } = require('../packages/template-engine/src/engine');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { sourceColumns, resolveTemplateForHeaders } = require('../packages/template-engine/src/mapping');

const col = (column) => ({ type: 'COLUMN', column });
const out = (columnId) => ({ type: 'OUTPUT', columnId });
const txt = (value) => ({ type: 'TEXT', value });
const num = (value) => ({ type: 'NUMBER', value });

function template(columns) {
  return validateTemplateConfig({
    name: 'Funciones',
    columns: columns.map(([id, outputName, source, extra = {}]) => ({ id, outputName, source, transformations: [], validations: [], ...extra }))
  });
}

function run(columns, row, context) {
  return transformRow(row, template(columns), context);
}

test('conditions with several branches, operators and a default value', () => {
  const tier = ['tier', 'SEGMENTO', {
    type: 'CASE',
    cases: [
      { match: 'ALL', conditions: [{ left: col('Monto'), op: 'GTE', right: num(1000000) }], result: txt('Grande') },
      { match: 'ANY', conditions: [{ left: col('Region'), op: 'IN', right: txt('Norte, Sur') }, { left: col('Canal'), op: 'CONTAINS', right: txt('web') }], result: txt('Regional') },
      { match: 'ALL', conditions: [{ left: col('Monto'), op: 'EMPTY' }], result: { type: 'EMPTY' } }
    ],
    otherwise: col('Region')
  }];
  assert.equal(run([tier], { Monto: '1.500.000', Region: 'Centro' }).output.SEGMENTO, 'Grande');
  assert.equal(run([tier], { Monto: 10, Region: 'sur' }).output.SEGMENTO, 'Regional');
  assert.equal(run([tier], { Monto: 10, Region: 'Centro', Canal: 'Tienda Web' }).output.SEGMENTO, 'Regional');
  assert.equal(run([tier], { Monto: null, Region: 'Centro' }).output.SEGMENTO, null);
  assert.equal(run([tier], { Monto: 10, Region: 'Centro' }).output.SEGMENTO, 'Centro');

  const dates = ['vence', 'ESTADO', { type: 'CASE', cases: [{ match: 'ALL', conditions: [{ left: col('Vence'), op: 'LT', right: col('Hoy') }], result: txt('Vencido') }], otherwise: txt('Vigente') }];
  assert.equal(run([dates], { Vence: '01-03-2024', Hoy: new Date(Date.UTC(2024, 4, 1)) }).output.ESTADO, 'Vencido');
});

test('value mapping table with case-insensitive matching and fallback modes', () => {
  const mapping = (otherwise) => ['g', 'GENERO', { type: 'MAP', input: col('Sexo'), entries: [{ from: 'M', to: 'Masculino' }, { from: 'f', to: 'Femenino' }], otherwise }];
  assert.equal(run([mapping({ mode: 'KEEP' })], { Sexo: ' m ' }).output.GENERO, 'Masculino');
  assert.equal(run([mapping({ mode: 'KEEP' })], { Sexo: 'F' }).output.GENERO, 'Femenino');
  assert.equal(run([mapping({ mode: 'KEEP' })], { Sexo: 'X' }).output.GENERO, 'X');
  assert.equal(run([mapping({ mode: 'EMPTY' })], { Sexo: 'X' }).output.GENERO, null);
  assert.equal(run([mapping({ mode: 'TEXT', value: 'Otro' })], { Sexo: 'X' }).output.GENERO, 'Otro');
});

test('first non-empty value and text with variables', () => {
  const phone = ['tel', 'TELEFONO', { type: 'COALESCE', operands: [col('Movil'), col('Fijo'), txt('sin teléfono')] }];
  assert.equal(run([phone], { Movil: '', Fijo: '221234' }).output.TELEFONO, '221234');
  assert.equal(run([phone], {}).output.TELEFONO, 'sin teléfono');

  const code = ['code', 'CODIGO', { type: 'COLUMN', column: 'Sku' }];
  const label = ['label', 'ETIQUETA', { type: 'TEMPLATE', text: '{Nombre} ({@CODIGO}) - {Fecha}' }];
  assert.equal(run([code, label], { Sku: 'A-1', Nombre: 'Mesa', Fecha: new Date(Date.UTC(2024, 4, 3)) }).output.ETIQUETA, 'Mesa (A-1) - 03/05/2024');
});

test('date calculations', () => {
  const calc = (op, operands, extra = {}) => ['d', 'R', { type: 'DATE_CALC', op, operands, ...extra }];
  const row = { Inicio: '27-01-2024', Fin: '02-02-2024', Dias: 10, Meses: 2 };
  assert.equal(run([calc('DAYS_BETWEEN', [col('Inicio'), col('Fin')])], row).output.R, 6);
  assert.equal(run([calc('DAYS_BETWEEN', [col('Inicio'), col('Fin')], { inclusive: true })], row).output.R, 7);
  const iso = (value) => value.toISOString().slice(0, 10);
  assert.equal(iso(run([calc('ADD_DAYS', [col('Inicio'), col('Dias')])], row).output.R), '2024-02-06');
  assert.equal(iso(run([calc('ADD_MONTHS', [col('Inicio'), col('Meses')])], row).output.R), '2024-03-27');
  assert.equal(iso(run([calc('END_OF_MONTH', [col('Fin')])], row).output.R), '2024-02-29');
  assert.equal(iso(run([calc('START_OF_MONTH', [col('Fin')])], row).output.R), '2024-02-01');
  assert.equal(run([calc('YEAR', [col('Fin')])], row).output.R, 2024);
  assert.equal(run([calc('MONTH', [col('Fin')])], row).output.R, 2);
  assert.equal(run([calc('DAY', [col('Fin')])], row).output.R, 2);
  assert.equal(iso(run([calc('TODAY', [])], row, { now: new Date(Date.UTC(2026, 8, 28, 15)) }).output.R), '2026-09-28');
  const formatted = template([['d', 'R', { type: 'DATE_CALC', op: 'END_OF_MONTH', operands: [col('Fin')] }, { transformations: [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD/MM/YYYY' }] }]]);
  assert.equal(transformRow(row, formatted).output.R, '29/02/2024');
  assert.deepEqual(run([calc('YEAR', [col('Fin')])], { Fin: 'mañana' }).issues.map((issue) => issue.code), ['INVALID_DATE']);
});

test('row number, min, max and absolute value', () => {
  assert.equal(run([['n', 'N', { type: 'ROW_NUMBER', start: 100 }]], {}, { rowIndex: 4 }).output.N, 104);
  const calc = (op, operands) => ['c', 'C', { type: 'CALC', op, operands }];
  assert.equal(run([calc('MIN', [col('a'), col('b'), num(5)])], { a: 8, b: '3' }).output.C, 3);
  assert.equal(run([calc('MAX', [col('a'), col('b')])], { a: 8, b: '3' }).output.C, 8);
  assert.equal(run([calc('ABS', [col('a')])], { a: -7 }).output.C, 7);
});

test('text functions: replace, pad, substring, title case, digits only, split by any separator', () => {
  const text = (transformations) => ['t', 'T', col('v'), { transformations }];
  const value = (transformations, v) => run([text(transformations)], { v }).output.T;
  assert.equal(value([{ type: 'REPLACE', find: '-', replace: '' }], '12-34-56'), '123456');
  assert.equal(value([{ type: 'PAD', length: 6, char: '0', side: 'LEFT' }], '42'), '000042');
  assert.equal(value([{ type: 'PAD', length: 5, char: '*', side: 'RIGHT' }], 'ab'), 'ab***');
  assert.equal(value([{ type: 'SUBSTRING', start: 2, length: 3 }], 'ABCDEFG'), 'BCD');
  assert.equal(value([{ type: 'SUBSTRING', start: 5 }], 'ABCDEFG'), 'EFG');
  assert.equal(value([{ type: 'TEXT', operation: 'TITLE_CASE' }], 'maría  JOSÉ de la fuente'), 'María José De La Fuente');
  assert.equal(value([{ type: 'TEXT', operation: 'DIGITS_ONLY' }], '+56 (9) 8765-4321'), '56987654321');
  assert.equal(run([['p', 'P', { type: 'SPLIT_WORD', column: 'v', index: 1, delimiter: ';' }]], { v: 'a; b c ;d' }).output.P, 'b c');
  assert.equal(run([['p', 'P', { type: 'SPLIT_WORD_RANGE', column: 'v', start: 1, delimiter: '/' }]], { v: 'x/y/z' }).output.P, 'y/z');
});

test('validation rejects unknown functions and references to later columns', () => {
  const bad = (source, later = { type: 'COLUMN', column: 'z' }) => () => template([['a', 'A', source], ['b', 'B', later]]);
  assert.throws(bad({ type: 'CASE', cases: [{ conditions: [{ left: col('x'), op: 'LIKE', right: txt('y') }], result: txt('1') }] }), /operador/);
  assert.throws(bad({ type: 'CASE', cases: [], otherwise: out('b') }), /anteriores/);
  assert.throws(bad({ type: 'TEMPLATE', text: 'Hola {@B}' }), /anteriores/);
  assert.throws(bad({ type: 'MAP', input: col('x'), entries: [], otherwise: { mode: 'NOPE' } }), /equivalencia/);
  assert.throws(bad({ type: 'DATE_CALC', op: 'NEXT_FRIDAY', operands: [col('x')] }), /fecha/);
  assert.throws(bad({ type: 'COALESCE', operands: [col('x')] }), /al menos 2/);
  assert.throws(() => template([['a', 'A', col('x'), { transformations: [{ type: 'PAD', length: 5, char: 'ab' }] }]]), /relleno/);
});

test('file columns used by any function are recognized and resolved against headers', () => {
  const source = {
    type: 'CASE',
    cases: [{ match: 'ALL', conditions: [{ left: col('monto total'), op: 'GT', right: num(0) }], result: txt('ok') }],
    otherwise: col('Region')
  };
  assert.deepEqual(sourceColumns(source).sort(), ['Region', 'monto total']);
  assert.deepEqual(sourceColumns({ type: 'TEMPLATE', text: '{Nombre} {@X} {Apellido}' }), ['Nombre', 'Apellido']);
  const resolved = resolveTemplateForHeaders({ columns: [{ id: 'a', outputName: 'A', source }] }, ['Monto Total', 'REGION']);
  assert.deepEqual(sourceColumns(resolved.columns[0].source).sort(), ['Monto Total', 'REGION']);
});
