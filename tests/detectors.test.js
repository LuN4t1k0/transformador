const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeColumn } = require('../packages/detectors/src');

test('detects semantic RUT deterministically', () => {
  const result = analyzeColumn('RUT', ['10.231.091-8', '10.805.128-0']);
  assert.equal(result.semantic.type, 'CHILEAN_RUT');
  assert.equal(result.physical.type, 'STRING');
});

test('detects year-month period', () => {
  const result = analyzeColumn('Periodo', ['201510', '201707', '201903']);
  assert.equal(result.semantic.type, 'YEAR_MONTH');
});
