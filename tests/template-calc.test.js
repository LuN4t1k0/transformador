const test = require('node:test');
const assert = require('node:assert/strict');
const { transformRow } = require('../packages/template-engine/src/engine');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { inferTemplate } = require('../packages/template-engine/src/infer');
const { evaluateColumns, sourceColumns } = require('../packages/template-engine/src/mapping');

function column(id, outputName, source, extra = {}) {
  return { id, outputName, required: false, source, transformations: [], validations: [], ...extra };
}

const capitalLike = validateTemplateConfig({
  name: 'Calculos',
  columns: [
    column('imponible', 'IMPONIBLE', { type: 'COLUMN', column: 'Remuneracion' }),
    column('renta', 'RENTA PROM.', { type: 'CALC', op: 'DIVIDE', operands: [{ type: 'OUTPUT', columnId: 'imponible' }, { type: 'NUMBER', value: 10 }] }),
    column('diez', '10%', { type: 'CALC', op: 'PERCENT', value: 10, operands: [{ type: 'OUTPUT', columnId: 'renta' }] }),
    column('adicional', 'ADICIONAL', { type: 'CALC', op: 'PERCENT', value: 1.44, operands: [{ type: 'OUTPUT', columnId: 'renta' }] }),
    column('total', 'TOTAL', { type: 'CALC', op: 'SUM', operands: [{ type: 'OUTPUT', columnId: 'diez' }, { type: 'OUTPUT', columnId: 'adicional' }] }),
    column('dias', 'DIAS', { type: 'CALC', op: 'SUBTRACT', operands: [{ type: 'COLUMN', column: 'dias_licencia' }, { type: 'COLUMN', column: 'dias_pagados' }] }),
    column('prom', 'PROMEDIO', { type: 'CALC', op: 'AVERAGE', round: { mode: 'NONE' }, operands: [{ type: 'COLUMN', column: 'a' }, { type: 'COLUMN', column: 'b' }] }),
    column('mult', 'DOBLE', { type: 'CALC', op: 'MULTIPLY', round: { mode: 'ROUND', decimals: 2 }, operands: [{ type: 'COLUMN', column: 'a' }, { type: 'NUMBER', value: 2.005 }] })
  ]
});

test('computes percentages, sums, differences and references to earlier output columns', () => {
  const { output, issues } = transformRow({ Remuneracion: '703.932', dias_licencia: 30, dias_pagados: 23, a: 3, b: 4 }, capitalLike);
  assert.deepEqual(issues, []);
  assert.equal(output.IMPONIBLE, '703.932');
  assert.equal(output['RENTA PROM.'], 70393);
  assert.equal(output['10%'], 7039);
  assert.equal(output.ADICIONAL, 1014);
  assert.equal(output.TOTAL, 8053);
  assert.equal(output.DIAS, 7);
  assert.equal(output.PROMEDIO, 3.5);
  assert.equal(output.DOBLE, 6.02);
});

test('reports non-numeric operands and division by zero', () => {
  const template = validateTemplateConfig({
    name: 'x',
    columns: [
      column('a', 'A', { type: 'CALC', op: 'PERCENT', value: 10, operands: [{ type: 'COLUMN', column: 'monto' }] }),
      column('b', 'B', { type: 'CALC', op: 'DIVIDE', operands: [{ type: 'COLUMN', column: 'monto' }, { type: 'NUMBER', value: 0 }] })
    ]
  });
  assert.deepEqual(transformRow({ monto: 'n/a' }, template).issues.map((issue) => `${issue.column}:${issue.code}`), ['A:INVALID_NUMBER', 'B:INVALID_NUMBER']);
  assert.deepEqual(transformRow({ monto: 100 }, template).issues.map((issue) => `${issue.column}:${issue.code}`), ['B:DIVISION_BY_ZERO']);
});

test('validates calculations: known operations, operand counts and only earlier column references', () => {
  const bad = (source) => () => validateTemplateConfig({ name: 'x', columns: [column('a', 'A', { type: 'COLUMN', column: 'x' }), column('b', 'B', source), column('c', 'C', { type: 'COLUMN', column: 'y' })] });
  assert.throws(bad({ type: 'CALC', op: 'POWER', operands: [{ type: 'NUMBER', value: 1 }, { type: 'NUMBER', value: 2 }] }), /operación/);
  assert.throws(bad({ type: 'CALC', op: 'SUM', operands: [{ type: 'NUMBER', value: 1 }] }), /al menos 2/);
  assert.throws(bad({ type: 'CALC', op: 'PERCENT', operands: [{ type: 'COLUMN', column: 'x' }] }), /porcentaje/);
  assert.throws(bad({ type: 'CALC', op: 'SUM', operands: [{ type: 'OUTPUT', columnId: 'c' }, { type: 'NUMBER', value: 1 }] }), /anterior/);
  assert.throws(bad({ type: 'CALC', op: 'SUM', operands: [{ type: 'OUTPUT', columnId: 'b' }, { type: 'NUMBER', value: 1 }] }), /anterior/);
  assert.throws(bad({ type: 'CALC', op: 'SUM', operands: [{ type: 'CODE', value: 'x' }, { type: 'NUMBER', value: 1 }] }), /operando/);
  const ok = validateTemplateConfig({ name: 'x', columns: [column('a', 'A', { type: 'COLUMN', column: 'x' }), column('b', 'B', { type: 'CALC', op: 'PERCENT', value: '1,44', operands: [{ type: 'OUTPUT', columnId: 'a' }] })] });
  assert.equal(ok.columns[1].source.value, 1.44);
  assert.deepEqual(ok.columns[1].source.round, { mode: 'ROUND', decimals: 0 });
});

test('calculation operands count as source columns for recognition and evaluation', () => {
  assert.deepEqual(sourceColumns(capitalLike.columns[5].source), ['dias_licencia', 'dias_pagados']);
  const rows = evaluateColumns(capitalLike.columns, ['Remuneracion', 'dias_licencia', 'a', 'b'], new Set());
  const dias = rows.rows.find((row) => row.column.id === 'dias');
  assert.match(dias.note, /dias_pagados/);
});

test('learns percentages and sums between columns of the destination example', () => {
  const renta = [70393, 80766, 70346, 57604];
  const rows = renta.map((value, index) => {
    const diez = Math.round(value * 0.1);
    const adicional = Math.round(value * 0.0144);
    return { values: { RUT: `1111111${index}-1`, IMPONIBLE: value * (10 + index * 5), 'RENTA PROM.': value, '10%': diez, ADICIONAL: adicional, TOTAL: diez + adicional } };
  });
  const { template, report } = inferTemplate({
    input: { headers: ['RUT', 'Remuneracion'], rows: [] },
    output: { headers: ['RUT', 'IMPONIBLE', 'RENTA PROM.', '10%', 'ADICIONAL', 'TOTAL'], rows }
  });
  const byName = Object.fromEntries(template.columns.map((item) => [item.outputName, item]));
  const rentaId = byName['RENTA PROM.'].id;
  assert.deepEqual(byName['10%'].source, { type: 'CALC', op: 'PERCENT', value: 10, operands: [{ type: 'OUTPUT', columnId: rentaId }], round: { mode: 'ROUND', decimals: 0 } });
  assert.deepEqual(byName.ADICIONAL.source, { type: 'CALC', op: 'PERCENT', value: 1.44, operands: [{ type: 'OUTPUT', columnId: rentaId }], round: { mode: 'ROUND', decimals: 0 } });
  assert.deepEqual(byName.TOTAL.source.op, 'SUM');
  assert.deepEqual(byName.TOTAL.source.operands.map((operand) => operand.columnId), [byName['10%'].id, byName.ADICIONAL.id]);
  assert.equal(report.byName['10%'].method, 'CALC');
  assert.ok(report.unresolved.includes('RENTA PROM.'));
  validateTemplateConfig(template);
});

test('a calculation that fits most rows is suggested, and exact ones replace similar-name guesses', () => {
  const renta = [70393, 80766, 70346, 57604, 74581, 62000, 91000];
  const rows = renta.map((value, index) => {
    const diez = Math.round(value * 0.1);
    const adicional = index === 4 ? 0 : Math.round(value * 0.0144);
    return { values: { 'RENTA PROM.': value, '10%': diez, ADICIONAL: adicional, TOTAL: diez + adicional } };
  });
  const { template, report } = inferTemplate({
    input: { headers: ['total_aporte_afp'], columns: [{ header: 'total_aporte_afp', physical: { type: 'INTEGER' } }], rows: [] },
    output: { headers: ['RENTA PROM.', '10%', 'ADICIONAL', 'TOTAL'], rows }
  });
  const byName = Object.fromEntries(template.columns.map((item) => [item.outputName, item]));
  assert.equal(byName.ADICIONAL.source.value, 1.44);
  assert.equal(report.byName.ADICIONAL.exceptions, 1);
  assert.ok(report.suggested.includes('ADICIONAL'));
  assert.equal(byName.TOTAL.source.op, 'SUM');
  assert.equal(report.byName.TOTAL.method, 'CALC');
  assert.ok(!report.suggested.includes('TOTAL'));
});
