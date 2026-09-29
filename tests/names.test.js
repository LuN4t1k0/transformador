const test = require('node:test');
const assert = require('node:assert/strict');
const { splitFullName, fullNamePart } = require('../packages/transformations/src/names');

const split = (value, order) => Object.values(splitFullName(value, order));

test('surnames first: paternal, maternal and given names', () => {
  assert.deepEqual(split('PÉREZ SOTO JUAN CARLOS'), ['PÉREZ', 'SOTO', 'JUAN CARLOS']);
  assert.deepEqual(split('  pérez   soto  juan '), ['pérez', 'soto', 'juan']);
  assert.deepEqual(split('DE LA FUENTE SOTO MARÍA DE LOS ÁNGELES'), ['DE LA FUENTE', 'SOTO', 'MARÍA DE LOS ÁNGELES']);
  assert.deepEqual(split('SAN MARTÍN DEL RÍO ANA'), ['SAN MARTÍN', 'DEL RÍO', 'ANA']);
  assert.deepEqual(split('PÉREZ JUAN'), ['PÉREZ', null, 'JUAN']);
  assert.deepEqual(split('PÉREZ'), ['PÉREZ', null, null]);
  assert.deepEqual(split(''), [null, null, null]);
});

test('given names first', () => {
  assert.deepEqual(split('Juan Carlos Pérez Soto', 'NAMES_FIRST'), ['Pérez', 'Soto', 'Juan Carlos']);
  assert.deepEqual(split('María de los Ángeles Soto de la Fuente', 'NAMES_FIRST'), ['Soto', 'de la Fuente', 'María de los Ángeles']);
  assert.deepEqual(split('Ana Pérez', 'NAMES_FIRST'), ['Pérez', null, 'Ana']);
});

test('a comma separates surnames from given names whatever the order', () => {
  assert.deepEqual(split('PÉREZ SOTO, JUAN CARLOS', 'NAMES_FIRST'), ['PÉREZ', 'SOTO', 'JUAN CARLOS']);
  assert.deepEqual(split('DE LA FUENTE, ANA'), ['DE LA FUENTE', null, 'ANA']);
});

test('parts', () => {
  const value = 'PÉREZ SOTO MARÍA JOSÉ';
  assert.equal(fullNamePart(value, { part: 'SURNAMES' }), 'PÉREZ SOTO');
  assert.equal(fullNamePart(value, { part: 'FIRST_NAME' }), 'MARÍA');
  assert.equal(fullNamePart('SOTO PÉREZ MARÍA DE LOS ÁNGELES', { part: 'FIRST_NAME' }), 'MARÍA');
  assert.equal(fullNamePart(null, { part: 'NAMES' }), null);
});
