const crypto = require('node:crypto');
const { packKeys } = require('../packs');
const { parseNumber } = require('../../../transformations/src/number');

// Replaces personal data in example rows before they leave the system (e.g. to the template assistant), keeping
// what is needed to understand the transformation:
// - identifiers known by the packs (RUT) become other valid identifiers written the same way;
// - free text (names, emails, addresses) is replaced word by word with invented words of the same length and case;
// - numbers, dates and categorical values (few distinct values that repeat, like an AFP or a code) stay as they are.
// The same real value always gets the same fake one, across the input and the output example, so pairs of rows
// still match. `reveal` turns fake values found in a proposal (constants, equivalences…) back into the real ones.

const CONSONANTS = 'bcdfghjklmnprstvz';
const VOWELS = 'aeiou';
// Connectors of names and addresses: not identifying, and needed to split compound surnames.
const KEEP_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'y', 'e', 'san', 'santa', 'sin', 'con', 'el']);

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function looksNumeric(text) {
  return /^-?[\d.,\s$%]+$/.test(text) && parseNumber(text.replace(/[\s$%]/g, '')) !== null;
}

function createPseudonymizer({ secret = crypto.randomBytes(16) } = {}) {
  const digest = (kind, value) => crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest();
  const wordMap = new Map();
  const usedWords = new Set();
  const keyMap = new Map();
  const reverse = new Map();

  function fakeWord(word) {
    const lower = stripAccents(word).toLowerCase();
    if (KEEP_WORDS.has(lower) || word.length < 2) return word;
    if (!wordMap.has(lower)) {
      let fake = '';
      for (let attempt = 0; !fake || usedWords.has(fake); attempt += 1) {
        const bytes = digest('word', `${lower}#${attempt}`);
        fake = Array.from({ length: lower.length }, (_, index) => (index % 2 === 0 ? CONSONANTS[bytes[index % 32] % CONSONANTS.length] : VOWELS[bytes[index % 32] % VOWELS.length])).join('');
      }
      usedWords.add(fake);
      wordMap.set(lower, fake);
    }
    const fake = wordMap.get(lower);
    const cased = word === word.toUpperCase() ? fake.toUpperCase() : word[0] === word[0].toUpperCase() ? fake[0].toUpperCase() + fake.slice(1) : fake;
    reverse.set(cased, word);
    return cased;
  }

  function fakeDigits(sequence) {
    const bytes = digest('digits', sequence);
    return Array.from({ length: sequence.length }, (_, index) => String(bytes[index % 32] % 10)).join('');
  }

  // Identifiers of the packs keep being valid (a RUT stays a RUT with a valid verifier).
  function fakeKey(text) {
    for (const key of packKeys()) {
      const real = key.key?.(text);
      if (!real || !key.fake) continue;
      if (!keyMap.has(`${key.id}:${real}`)) keyMap.set(`${key.id}:${real}`, fakeDigits(`${key.id}:${real}`.replace(/\D/g, '') || '0'));
      const fake = key.fake(text, keyMap.get(`${key.id}:${real}`));
      if (fake) {
        reverse.set(fake, text);
        return fake;
      }
    }
    return null;
  }

  // Any text: identifiers, then letters word by word and long digit runs (phones, accounts) consistently.
  function text(value) {
    if (typeof value !== 'string' || isBlank(value)) return value;
    const trimmed = value.trim();
    if (looksNumeric(trimmed)) return value;
    const key = fakeKey(trimmed);
    if (key) return key;
    const fake = value
      .replace(/\p{L}+/gu, (word) => fakeWord(word))
      .replace(/\d{3,}/g, (digits) => fakeDigits(digits));
    if (fake !== value) reverse.set(fake, value);
    return fake;
  }

  // Columns with few distinct values that repeat are categories (AFP, sex, codes): kept as they are.
  function categoricalColumns(headers, rows) {
    const categorical = new Set();
    for (const header of headers) {
      const values = rows.map((row) => row.values?.[header]).filter((value) => typeof value === 'string' && !isBlank(value)).map((value) => value.trim().toLowerCase());
      const distinct = new Set(values);
      if (values.length >= 3 && distinct.size <= Math.max(2, Math.floor(values.length * 0.4)) && distinct.size < values.length) categorical.add(header);
    }
    return categorical;
  }

  function rows(headers, list) {
    const keep = categoricalColumns(headers, list);
    return list.map((row) => ({
      ...row,
      values: Object.fromEntries(Object.entries(row.values || {}).map(([header, value]) => [header, keep.has(header) ? value : text(value)]))
    }));
  }

  // Fake values found in a proposal (constants, equivalence tables, texts…) back to the real ones.
  function reveal(value) {
    if (typeof value !== 'string') return value;
    if (reverse.has(value)) return reverse.get(value);
    let revealed = value;
    for (const [fake, real] of [...reverse.entries()].sort((a, b) => b[0].length - a[0].length)) {
      if (fake.length >= 3 && revealed.includes(fake)) revealed = revealed.split(fake).join(real);
    }
    return revealed;
  }

  function revealDeep(node) {
    if (typeof node === 'string') return reveal(node);
    if (Array.isArray(node)) return node.map(revealDeep);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, revealDeep(value)]));
    return node;
  }

// Hides, in any text, only what was already replaced in the rows (so a template shown to the assistant is
  // consistent with the rows it sees); {Column} references are left untouched.
  function known(value) {
    if (typeof value !== 'string' || isBlank(value)) return value;
    const key = [...packKeys()].some((candidate) => candidate.key?.(value.trim()) && keyMap.has(`${candidate.id}:${candidate.key(value.trim())}`)) ? fakeKey(value.trim()) : null;
    if (key) return key;
    return value.split(/(\{[^{}]*\})/).map((part) => (part.startsWith('{') ? part : part.replace(/\p{L}+/gu, (word) => (wordMap.has(stripAccents(word).toLowerCase()) ? fakeWord(word) : word)))).join('');
  }

  // Literal values of a template (constants, equivalences, texts); structural fields are never touched.
  const STRUCTURAL = new Set(['type', 'op', 'id', 'columnId', 'paramId', 'column', 'outputName', 'mode', 'match', 'part', 'order', 'format', 'operation', 'inputFormat', 'outputFormat', 'side', 'direction', 'aliases']);
  function hideDeep(node) {
    if (typeof node === 'string') return known(node);
    if (Array.isArray(node)) return node.map(hideDeep);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, STRUCTURAL.has(key) ? value : hideDeep(value)]));
    return node;
  }

  return { text, rows, reveal, revealDeep, hideDeep };
}

module.exports = { createPseudonymizer };
