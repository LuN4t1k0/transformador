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

  let text = String(value).trim().replace(/[\s$]/g, '');
  // A percentage written as text ("0,69%") is the fraction Excel would store (0.0069).
  const isPercent = text.endsWith('%');
  if (isPercent) text = text.slice(0, -1);
  if (!text) return null;
  const normalized = normalizeNumberText(text, decimalSeparator);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return isPercent ? cleanFloat(parsed / 100) : parsed;
}

// Removes binary noise such as 0.69 / 100 = 0.006899999999999999.
function cleanFloat(number) {
  return Number(number.toPrecision(12));
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

  // As a percentage: 0.0069 is written "0.69%" (with the chosen decimals and separator).
  if (options.percent === true) number = cleanFloat(number * 100);
  const text = Number.isInteger(options.fixedDecimals) ? number.toFixed(options.fixedDecimals) : null;
  const written = options.decimalSeparator === ',' ? (text ?? String(number)).replace('.', ',') : text ?? number;
  return options.percent === true ? `${written}%` : written;
}

module.exports = { parseNumber, transformNumber };
