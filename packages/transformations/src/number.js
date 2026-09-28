const CHILEAN_THOUSANDS = /^-?\d{1,3}(\.\d{3})+$/;
const COMMA_THOUSANDS = /^-?\d{1,3}(,\d{3}){2,}$/;

// Normalizes a text number to "1234.56". AUTO follows Chilean conventions when a single separator is
// ambiguous: "1.234" is thousands, "1,5" is a decimal comma; with both separators the last one is decimal.
function normalizeNumberText(text, decimalSeparator) {
  if (decimalSeparator === ',') return text.replace(/\./g, '').replace(',', '.');
  if (decimalSeparator === '.') return text.replace(/,/g, '');

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    return lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  }
  if (lastComma >= 0) return COMMA_THOUSANDS.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  if (lastDot >= 0) return CHILEAN_THOUSANDS.test(text) ? text.replace(/\./g, '') : text;
  return text;
}

function parseNumber(value, { decimalSeparator = 'AUTO' } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value).trim().replace(/[\s$]/g, '');
  if (!text) return null;
  const normalized = normalizeNumberText(text, decimalSeparator);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function transformNumber(value, options = {}) {
  let number = parseNumber(value, { decimalSeparator: options.inputDecimalSeparator });
  if (number === null) return null;

  if (options.absolute === true) number = Math.abs(number);
  if (Number.isInteger(options.round)) {
    const factor = 10 ** options.round;
    number = Math.round(number * factor) / factor;
  }
  if (options.integer === true) number = Math.trunc(number);

  const text = Number.isInteger(options.fixedDecimals) ? number.toFixed(options.fixedDecimals) : null;
  if (options.decimalSeparator === ',') return (text ?? String(number)).replace('.', ',');
  return text ?? number;
}

module.exports = { parseNumber, transformNumber };
