const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { previewRows } = require('../packages/template-engine/src/rows');

const col = (column) => ({ type: 'COLUMN', column });
const out = (columnId) => ({ type: 'OUTPUT', columnId });
const txt = (value) => ({ type: 'TEXT', value });
const num = (value) => ({ type: 'NUMBER', value });

function template(rowSteps, extraColumns = [], output) {
  return validateTemplateConfig({
    name: 'Filas',
    output,
    columns: [
      { id: 'n', outputName: 'N', source: { type: 'ROW_NUMBER', start: 1 } },
      { id: 'rut', outputName: 'RUT', source: col('Rut') },
      { id: 'area', outputName: 'AREA', source: col('Area') },
      { id: 'monto', outputName: 'MONTO', source: col('Monto'), transformations: [{ type: 'NUMBER', fixedDecimals: 2, decimalSeparator: ',' }] },
      { id: 'fecha', outputName: 'FECHA', source: col('Fecha'), transformations: [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'DD/MM/YYYY' }] },
      ...extraColumns
    ].map((column) => ({ transformations: [], validations: [], ...column, ...(output?.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 10, align: 'LEFT', padChar: ' ' } } : {}) })),
    rowSteps
  });
}

const input = [
  { Rut: '1-9', Area: 'Ventas', Monto: 1000, Fecha: '05-01-2024' },
  { Rut: null, Area: null, Monto: 250.5, Fecha: '07-01-2024' },
  { Rut: '2-7', Area: 'Bodega', Monto: 300, Fecha: '02-01-2024' },
  { Rut: 'TOTAL', Area: null, Monto: 1550.5, Fecha: null },
  { Rut: '1-9', Area: 'Ventas', Monto: 10, Fecha: '09-01-2024' }
].map((values, index) => ({ rowNumber: index + 2, values }));

const column = (results, name) => results.map((row) => row.output[name]);

test('templates without row steps keep their stored shape and results', () => {
  const plain = template(undefined);
  assert.equal('rowSteps' in plain, false);
  assert.equal('rowSteps' in template({ fillDown: [], sort: [], filter: { conditions: [] } }), false);
  const { results, stats } = previewRows(input, plain);
  assert.deepEqual(column(results, 'N'), [1, 2, 3, 4, 5]);
  assert.deepEqual(stats, { excludedRows: 0, duplicateRows: 0, outputRows: 5 });
});

test('fill down and filter (excluding a totals row by an input column)', () => {
  const steps = {
    fillDown: ['Rut', 'Area'],
    filter: { mode: 'EXCLUDE', match: 'ANY', conditions: [{ left: col('Rut'), op: 'EQ', right: txt('total') }] }
  };
  const { results, excluded, stats } = previewRows(input, template(steps));
  assert.deepEqual(column(results, 'RUT'), ['1-9', '1-9', '2-7', '1-9']);
  assert.deepEqual(column(results, 'AREA'), ['Ventas', 'Ventas', 'Bodega', 'Ventas']);
  assert.deepEqual(column(results, 'N'), [1, 2, 3, 4], 'correlatives skip excluded rows');
  assert.deepEqual(excluded.map((row) => row.rowNumber), [5]);
  assert.equal(stats.excludedRows, 1);

  const keep = template({ filter: { mode: 'KEEP', conditions: [{ left: out('monto'), op: 'GTE', right: num(300) }] } });
  assert.deepEqual(column(previewRows(input, keep).results, 'RUT'), ['1-9', '2-7', 'TOTAL']);
});

test('remove duplicates keeping the first or the last row', () => {
  const first = previewRows(input, template({ fillDown: ['Rut'], dedupe: { columnIds: ['rut'], keep: 'FIRST' } }));
  assert.deepEqual(column(first.results, 'MONTO'), ['1000,00', '300,00', '1550,50']);
  assert.equal(first.stats.duplicateRows, 2);
  const last = previewRows(input, template({ fillDown: ['Rut'], dedupe: { columnIds: ['rut'], keep: 'LAST' } }));
  assert.deepEqual(column(last.results, 'MONTO'), ['300,00', '1550,50', '10,00']);
  assert.deepEqual(column(last.results, 'N'), [1, 2, 3]);
});

test('group and summarize: sums keep the column format, dates compare as dates', () => {
  const steps = {
    fillDown: ['Rut', 'Area'],
    filter: { mode: 'EXCLUDE', conditions: [{ left: col('Rut'), op: 'EQ', right: txt('TOTAL') }] },
    group: {
      columnIds: ['rut'],
      aggregates: [{ columnId: 'monto', op: 'SUM' }, { columnId: 'fecha', op: 'MAX' }, { columnId: 'cuenta', op: 'COUNT' }, { columnId: 'area', op: 'CONCAT' }]
    }
  };
  const { results, stats } = previewRows(input, template(steps, [{ id: 'cuenta', outputName: 'CUENTA', source: { type: 'EMPTY' } }]));
  assert.deepEqual(results.map((row) => [row.output.N, row.output.RUT, row.output.MONTO, row.output.FECHA, row.output.CUENTA, row.output.AREA]), [
    [1, '1-9', '1260,50', '09/01/2024', 3, 'Ventas'],
    [2, '2-7', '300,00', '02/01/2024', 1, 'Bodega']
  ]);
  assert.deepEqual(results[0].rowNumbers, [2, 3, 6]);
  assert.equal(stats.outputRows, 2);
});

test('a text in a summed column is a row issue', () => {
  const rows = [{ rowNumber: 2, values: { Rut: '1-9', Monto: 'n/a' } }, { rowNumber: 3, values: { Rut: '1-9', Monto: 5 } }];
  const plain = template({ group: { columnIds: ['rut'], aggregates: [{ columnId: 'monto', op: 'SUM' }] } }, [], undefined);
  const noFormat = { ...plain, columns: plain.columns.map((c) => (c.id === 'monto' ? { ...c, transformations: [] } : c)) };
  const { results } = previewRows(rows, noFormat);
  assert.deepEqual(results[0].issues.map((issue) => issue.code), ['INVALID_NUMBER']);
  assert.equal(results[1].output.MONTO, 5);
});

test('sort by several columns with blanks last and correlatives in final order', () => {
  const steps = { sort: [{ columnId: 'area', direction: 'ASC' }, { columnId: 'fecha', direction: 'DESC' }] };
  const { results } = previewRows(input, template(steps));
  assert.deepEqual(results.map((row) => row.rowNumber), [4, 6, 2, 3, 5]);
  assert.deepEqual(column(results, 'N'), [1, 2, 3, 4, 5]);
  const byAmount = previewRows(input, template({ sort: [{ columnId: 'monto', direction: 'DESC' }] })).results;
  assert.deepEqual(column(byAmount, 'MONTO'), ['1550,50', '1000,00', '300,00', '250,50', '10,00'], 'numbers sort as numbers, not as formatted text');
});

test('grouped totals longer than a fixed width column are reported', () => {
  const rows = [{ rowNumber: 2, values: { Rut: '1', Monto: 9999999 } }, { rowNumber: 3, values: { Rut: '1', Monto: 9999999 } }];
  const fixed = template({ group: { columnIds: ['rut'], aggregates: [{ columnId: 'monto', op: 'SUM' }] } }, [], { format: 'FIXED_WIDTH' });
  const { results } = previewRows(rows, fixed);
  assert.deepEqual(results[0].issues.map((issue) => [issue.column, issue.code]), [['MONTO', 'TOO_LONG']]);
});

test('row steps are validated', () => {
  assert.throws(() => template({ sort: [{ columnId: 'nope' }] }), /no existe/);
  assert.throws(() => template({ group: { columnIds: ['rut'], aggregates: [{ columnId: 'monto', op: 'MEDIAN' }] } }), /resumen/);
  assert.throws(() => template({ filter: { conditions: [{ left: out('zzz'), op: 'EMPTY' }] } }), /no existe/);
  assert.throws(() => template({ dedupe: { columnIds: ['rut'], keep: 'MIDDLE' } }), /conservar/);
  const normalized = template({ group: { columnIds: ['rut'], aggregates: [{ columnId: 'rut', op: 'SUM' }, { columnId: 'monto', op: 'SUM' }] } });
  assert.deepEqual(normalized.rowSteps.group.aggregates, [{ columnId: 'monto', op: 'SUM' }], 'grouping columns cannot be summarized');
});
