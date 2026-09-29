const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');
const { createSummaryAccumulator, runRows } = require('../packages/template-engine/src/run');

test('masks RUT digits keeping format, first digits and verifier', async () => {
  const { maskValue } = await import('../apps/web/lib/preview.js');
  const rut = { outputName: 'RUT', transformations: [{ type: 'RUT_FORMAT', format: 'DOTS_DASH' }] };
  assert.equal(maskValue(rut, '10.231.091-8'), '10.•••.•••-8');
  assert.equal(maskValue(rut, '102310918'), '10••••••8');
  assert.equal(maskValue(rut, null), null);
  assert.equal(maskValue({ outputName: 'MONTO', transformations: [] }, '102310918'), '102310918', 'only sensitive columns are masked');
});

test('runs rows through the template and reports fixed width overflow', () => {
  const template = {
    output: { format: 'FIXED_WIDTH' },
    columns: [{ id: 'r', position: 1, outputName: 'RUT', source: { type: 'COLUMN', column: 'RUT' }, transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' }], fixedWidth: { length: 5 } }]
  };
  const [result] = runRows([{ rowNumber: 7, values: { RUT: '10.231.091-8' } }], template);
  assert.equal(result.rowNumber, 7);
  assert.equal(result.output.RUT, '102310918');
  assert.deepEqual(result.issues.map((issue) => issue.code), ['TOO_LONG']);
});

test('summary groups issues by column and code with exact counts', () => {
  const summary = createSummaryAccumulator({ sampleRowsPerGroup: 1 });
  assert.equal(summary.add(2, []), true);
  assert.equal(summary.add(3, [{ severity: 'error', code: 'INVALID_RUT', column: 'RUT', message: 'x' }, { severity: 'error', code: 'REQUIRED', column: 'RUT' }]), false);
  summary.add(4, [{ severity: 'error', code: 'INVALID_RUT', column: 'RUT' }]);
  summary.add(5, [{ severity: 'warning', code: 'X', column: 'AFP' }]);

  const result = summary.result();
  assert.deepEqual(
    { total: result.totalRows, valid: result.validRows, errors: result.errorCount, warnings: result.warningCount },
    { total: 4, valid: 2, errors: 3, warnings: 1 }
  );
  assert.deepEqual(result.issueGroups[0], { column: 'RUT', rule: undefined, severity: 'error', code: 'INVALID_RUT', count: 2, sampleRows: [3] });
  assert.equal(JSON.stringify(result).includes('"x"'), false, 'issue messages with values are not kept');
});
