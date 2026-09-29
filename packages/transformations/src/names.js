// Splits a full name into paternal surname, maternal surname and given names (Spanish naming convention).
// Particles stay with the word that follows them, so "De la Fuente" or "San Martín" are one surname and
// "María de los Ángeles" keeps together as given names.

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'y', 'san', 'santa']);
const NAME_ORDERS = ['SURNAMES_FIRST', 'NAMES_FIRST'];
const NAME_PARTS = ['PATERNAL', 'MATERNAL', 'SURNAMES', 'NAMES', 'FIRST_NAME'];

const isParticle = (word) => PARTICLES.has(word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);

// Surname units from the start: particles join the next word ("de la Fuente").
function surnamesFromStart(list, count) {
  const units = [];
  let index = 0;
  while (units.length < count && index < list.length) {
    const unit = [];
    while (index < list.length - 1 && isParticle(list[index])) unit.push(list[index++]);
    unit.push(list[index++]);
    units.push(unit.join(' '));
  }
  return { units, rest: list.slice(index) };
}

// Surname units from the end: a word takes the particles written right before it.
function surnamesFromEnd(list, count) {
  const units = [];
  let index = list.length - 1;
  while (units.length < count && index >= 0) {
    const unit = [list[index--]];
    while (index >= 1 && isParticle(list[index])) unit.unshift(list[index--]);
    units.unshift(unit.join(' '));
  }
  return { units, rest: list.slice(0, index + 1) };
}

function splitFullName(value, order = 'SURNAMES_FIRST') {
  const text = String(value ?? '').trim();
  if (!text) return { paternal: null, maternal: null, names: null };

  // "PÉREZ SOTO, JUAN CARLOS": the comma separates surnames from given names whatever the order setting.
  if (text.includes(',')) {
    const [surnamePart, ...nameParts] = text.split(',');
    const { units, rest } = surnamesFromStart(words(surnamePart), 1);
    return { paternal: units[0] || null, maternal: rest.join(' ') || null, names: words(nameParts.join(' ')).join(' ') || null };
  }

  const list = words(text);
  if (order === 'NAMES_FIRST') {
    // With only two words there is a given name and one surname.
    const { units, rest } = surnamesFromEnd(list, list.length > 2 ? 2 : 1);
    const [paternal, maternal] = units.length === 2 ? units : [units[0], null];
    return { paternal: paternal || null, maternal: maternal || null, names: rest.join(' ') || null };
  }
  const { units, rest } = surnamesFromStart(list, list.length > 2 ? 2 : 1);
  return { paternal: units[0] || null, maternal: units[1] || null, names: rest.join(' ') || null };
}

function fullNamePart(value, { order = 'SURNAMES_FIRST', part }) {
  const { paternal, maternal, names } = splitFullName(value, order);
  if (part === 'PATERNAL') return paternal;
  if (part === 'MATERNAL') return maternal;
  if (part === 'SURNAMES') return [paternal, maternal].filter(Boolean).join(' ') || null;
  if (part === 'FIRST_NAME') return names ? surnamesFromStart(words(names), 1).units[0] : null;
  return names;
}

module.exports = { splitFullName, fullNamePart, NAME_ORDERS, NAME_PARTS };
