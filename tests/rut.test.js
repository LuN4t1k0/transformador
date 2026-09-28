const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRut, isValidRut, calculateDv } = require('../packages/transformations/src');

test('validates and formats Chilean RUT values', () => {
  assert.equal(calculateDv('10231091'), '8');
  assert.equal(isValidRut('10.231.091-8'), true);
  assert.equal(formatRut('10.231.091-8', 'NO_DOTS_NO_DASH'), '102310918');
  assert.equal(formatRut('102310918', 'NO_DOTS_DASH'), '10231091-8');
  assert.equal(formatRut('102310918', 'DOTS_DASH'), '10.231.091-8');
});
