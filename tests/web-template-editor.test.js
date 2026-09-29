const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');

const load = () => import('../apps/web/lib/template-editor.js');
const seed = validateTemplateConfig(planVitalPagexTemplate);

test('format model round-trips every seed column without losing transformations', async () => {
  const { parseFormat, applyFormat } = await load();
  for (const column of seed.columns) {
    const rebuilt = applyFormat(column, parseFormat(column));
    assert.deepEqual(
      { t: rebuilt.transformations, v: rebuilt.validations },
      { t: column.transformations, v: column.validations },
      column.outputName
    );
  }
});

test('builds RUT, date and number formats from the UI model', async () => {
  const { parseFormat, applyFormat } = await load();
  const base = { id: 'x', outputName: 'X', source: { type: 'COLUMN', column: 'X' }, transformations: [], validations: [] };
  const format = { ...parseFormat(base), kind: 'RUT', domainOption: 'BODY', domainValidate: true, textCase: 'UPPERCASE' };
  assert.deepEqual(applyFormat(base, format).transformations, [{ type: 'RUT_FORMAT', format: 'BODY' }, { type: 'TEXT', operation: 'UPPERCASE' }]);
  assert.deepEqual(applyFormat(base, format).validations, [{ type: 'VALID_RUT' }]);

  assert.deepEqual(applyFormat(base, { ...format, kind: 'DATE', dateInput: 'AUTO', dateOutput: 'YYYYMMDD', textCase: 'NONE' }).transformations, [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'YYYYMMDD' }]);
  assert.deepEqual(applyFormat(base, { ...format, kind: 'NUMBER', numberDecimals: 2, decimalSeparator: ',', textCase: 'NONE' }).transformations, [{ type: 'NUMBER', fixedDecimals: 2, decimalSeparator: ',' }]);
  assert.deepEqual(applyFormat(base, { ...format, kind: 'NUMBER', numberDecimals: 2, decimalSeparator: '.', inputDecimalSeparator: '.', textCase: 'NONE' }).transformations, [{ type: 'NUMBER', fixedDecimals: 2, inputDecimalSeparator: '.' }]);
});

test('round-trips the generic text functions', async () => {
  const { parseFormat, applyFormat } = await load();
  const transformations = [
    { type: 'TEXT', operation: 'TITLE_CASE' },
    { type: 'TEXT', operation: 'DIGITS_ONLY' },
    { type: 'REPLACE', find: '-', replace: '' },
    { type: 'SUBSTRING', start: 2, length: 3 },
    { type: 'PAD', length: 8, char: '0', side: 'LEFT' }
  ];
  const column = { id: 'x', outputName: 'X', source: { type: 'COLUMN', column: 'X' }, transformations, validations: [] };
  const format = parseFormat(column);
  assert.equal(format.textCase, 'TITLE_CASE');
  assert.equal(format.digitsOnly, true);
  assert.deepEqual(applyFormat(column, format).transformations, transformations);
  validateTemplateConfig({ name: 'T', columns: [applyFormat(column, format)] });
});

test('adds, duplicates and moves columns keeping names unique', async () => {
  const { createColumn, duplicateColumn, moveColumn } = await load();
  const columns = [{ id: 'a', outputName: 'Nueva columna' }, { id: 'b', outputName: 'B' }];
  const added = createColumn(columns, true);
  assert.equal(added.outputName, 'Nueva columna 2');
  assert.deepEqual(added.fixedWidth, { length: 10, align: 'LEFT', padChar: ' ' });

  const duplicated = duplicateColumn(columns, 1);
  assert.deepEqual(duplicated.map((column) => column.outputName), ['Nueva columna', 'B', 'B copia']);
  assert.notEqual(duplicated[2].id, 'b');

  assert.deepEqual(moveColumn(columns, 1, -1).map((column) => column.id), ['b', 'a']);
  assert.equal(moveColumn(columns, 0, -1), columns);
});

test('detects structural changes against the base template', async () => {
  const { hasTemplateChanges } = await load();
  const draft = structuredClone(seed);
  draft.columns[0].aliases = ['otro'];
  assert.equal(hasTemplateChanges(seed, draft), false);
  draft.columns[0].transformations = [];
  assert.equal(hasTemplateChanges(seed, draft), true);
  assert.equal(hasTemplateChanges(null, draft), true);
});

test('revives dates from sample rows', async () => {
  const { reviveSampleRows, formatCell } = await load();
  const [row] = reviveSampleRows([{ rowNumber: 2, values: { F: { $date: '2024-05-03T00:00:00.000Z' }, N: 5 } }]);
  assert.ok(row.values.F instanceof Date);
  assert.equal(formatCell(row.values.F), '03/05/2024');
  assert.equal(formatCell(null), '');
});

test('removing a column drops row steps that used it and keeps the rest', async () => {
  const { withColumns } = await load();
  const columns = [{ id: 'a', outputName: 'A' }, { id: 'b', outputName: 'B' }];
  const template = {
    columns,
    rowSteps: {
      fillDown: ['X'],
      filter: { mode: 'KEEP', match: 'ALL', conditions: [{ left: { type: 'OUTPUT', columnId: 'b' }, op: 'NOT_EMPTY' }, { left: { type: 'COLUMN', column: 'Z' }, op: 'EMPTY' }] },
      dedupe: { columnIds: ['b'], keep: 'FIRST' },
      group: { columnIds: ['a', 'b'], aggregates: [] },
      sort: [{ columnId: 'b', direction: 'DESC' }, { columnId: 'a', direction: 'ASC' }]
    }
  };
  const next = withColumns(template, [columns[0]]);
  assert.deepEqual(next.rowSteps, {
    fillDown: ['X'],
    filter: { mode: 'KEEP', match: 'ALL', conditions: [{ left: { type: 'COLUMN', column: 'Z' }, op: 'EMPTY' }] },
    group: { columnIds: ['a'], aggregates: [] },
    sort: [{ columnId: 'a', direction: 'ASC' }]
  });
  assert.equal('rowSteps' in withColumns({ columns, rowSteps: { sort: [{ columnId: 'b', direction: 'ASC' }] } }, [columns[0]]), false);
});

test('removing a column also drops its totals and the split that used it', async () => {
  const { withColumns } = await load();
  const columns = [{ id: 'a', outputName: 'A' }, { id: 'b', outputName: 'B' }];
  const output = { format: 'XLSX', totals: { label: 'TOTAL', columns: [{ columnId: 'a', op: 'SUM' }, { columnId: 'b', op: 'SUM' }] }, split: { columnId: 'b', mode: 'SHEETS' } };
  assert.deepEqual(withColumns({ columns, output }, [columns[0]]).output, { format: 'XLSX', totals: { label: 'TOTAL', columns: [{ columnId: 'a', op: 'SUM' }] } });
  assert.deepEqual(withColumns({ columns, output }, [columns[1]]).output.totals.columns, [{ columnId: 'b', op: 'SUM' }]);
});

test('splits a RUT column into the number and a new check digit column right after it', async () => {
  const { splitColumn, domainFormats } = await load();
  const rut = domainFormats().find((format) => format.kind === 'RUT');
  const columns = [
    { id: 'a', outputName: 'RUT', source: { type: 'COLUMN', column: 'Rut' }, transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_DASH' }], validations: [{ type: 'VALID_RUT' }] },
    { id: 'b', outputName: 'NOMBRE', source: { type: 'COLUMN', column: 'Nombre' }, transformations: [], validations: [] }
  ];
  const next = splitColumn(columns, 0, rut);
  assert.deepEqual(next.map((column) => column.outputName), ['RUT', 'RUT DV', 'NOMBRE']);
  assert.deepEqual(next.map((column) => column.transformations), [[{ type: 'RUT_FORMAT', format: 'BODY' }], [{ type: 'RUT_FORMAT', format: 'DV' }], []]);
  assert.deepEqual(next[1].validations, [{ type: 'VALID_RUT' }]);
  assert.deepEqual(next[1].source, { type: 'COLUMN', column: 'Rut' });
  validateTemplateConfig({ name: 'T', columns: next });
});

test('splits a full name column into paternal surname, maternal surname and given names', async () => {
  const { splitNameColumn } = await load();
  const columns = [
    { id: 'n', outputName: 'NOMBRE COMPLETO', source: { type: 'COLUMN', column: 'Nombre' }, transformations: [{ type: 'TEXT', operation: 'UPPERCASE' }], validations: [] },
    { id: 'm', outputName: 'NOMBRES', source: { type: 'COLUMN', column: 'Otro' }, transformations: [], validations: [] }
  ];
  const next = splitNameColumn(columns, 0, { type: 'NAME_PART', column: 'Nombre', order: 'NAMES_FIRST', part: 'PATERNAL' });
  assert.deepEqual(next.map((column) => column.outputName), ['APELLIDO PATERNO', 'APELLIDO MATERNO', 'NOMBRES 2', 'NOMBRES']);
  assert.equal(next[0].id, 'n');
  assert.deepEqual(next.slice(0, 3).map((column) => column.source.part), ['PATERNAL', 'MATERNAL', 'NAMES']);
  assert.deepEqual(next[2].transformations, [{ type: 'TEXT', operation: 'UPPERCASE' }], 'keeps the column format');
  validateTemplateConfig({ name: 'T', columns: next });
});
