function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function transformNumber(value, options = {}) {
  let number = parseNumber(value);
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
