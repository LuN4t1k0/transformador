const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
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
  const format = { ...parseFormat(base), kind: 'RUT', rutFormat: 'BODY', validateRut: true, textCase: 'UPPERCASE' };
  assert.deepEqual(applyFormat(base, format).transformations, [{ type: 'RUT_FORMAT', format: 'BODY' }, { type: 'TEXT', operation: 'UPPERCASE' }]);
  assert.deepEqual(applyFormat(base, format).validations, [{ type: 'VALID_RUT' }]);

  assert.deepEqual(applyFormat(base, { ...format, kind: 'DATE', dateInput: 'AUTO', dateOutput: 'YYYYMMDD', textCase: 'NONE' }).transformations, [{ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'YYYYMMDD' }]);
  assert.deepEqual(applyFormat(base, { ...format, kind: 'NUMBER', numberDecimals: 2, decimalSeparator: ',', textCase: 'NONE' }).transformations, [{ type: 'NUMBER', fixedDecimals: 2, decimalSeparator: ',' }]);
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
