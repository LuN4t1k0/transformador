function transformText(value, operation) {
  if (value === null || value === undefined) return value;
  let text = String(value);

  if (operation === 'TRIM') return text.trim();
  if (operation === 'UPPERCASE') return text.toUpperCase();
  if (operation === 'LOWERCASE') return text.toLowerCase();
  if (operation === 'NORMALIZE_SPACES') return text.replace(/\s+/g, ' ').trim();
  if (operation === 'REMOVE_ACCENTS') {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  throw new Error(`Unsupported text operation: ${operation}`);
}

function splitWords(value) {
  if (value === null || value === undefined) return [];
  return String(value).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
}

module.exports = { transformText, splitWords };
