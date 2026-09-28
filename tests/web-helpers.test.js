const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { createSummaryAccumulator, runRows } = require('../packages/template-engine/src/run');

test('masks RUT digits keeping format, first digits and verifier', async () => {
  const { maskRut } = await import('../apps/web/lib/preview.js');
  assert.equal(maskRut('10.231.091-8'), '10.•••.•••-8');
  assert.equal(maskRut('102310918'), '10••••••8');
  assert.equal(maskRut(null), null);
});

test('runs rows with the job mapping instead of the seed sources', () => {
  const mapping = Object.fromEntries(planVitalPagexTemplate.columns.map((column) => [column.id, column.source]));
  mapping.fecha_fin = { type: 'COLUMN', column: 'Fecha Termino' };

  const [result] = runRows(
    [{ rowNumber: 7, values: { RUT: '10.231.091-8', 'Nombre completo': 'NEIRA QUINCHAHUAL MARIA', 'Fecha Termino': '19-10-2015' } }],
    planVitalPagexTemplate,
    mapping
  );

  assert.equal(result.rowNumber, 7);
  assert.equal(result.output['FEC. FIN'], '19/10/2015');
  assert.equal(result.output.NOMBRE, 'MARIA');
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
