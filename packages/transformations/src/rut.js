function normalizeRut(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\./g, '').replace(/-/g, '').toUpperCase();
}

function splitRut(value) {
  const normalized = normalizeRut(value);
  if (!/^\d{1,8}[\dK]$/.test(normalized)) return null;
  return {
    body: normalized.slice(0, -1),
    dv: normalized.slice(-1)
  };
}

function calculateDv(body) {
  const digits = String(body).replace(/\D/g, '');
  let multiplier = 2;
  let sum = 0;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    sum += Number(digits[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

function isValidRut(value) {
  const parts = splitRut(value);
  if (!parts) return false;
  return calculateDv(parts.body) === parts.dv;
}

function formatRut(value, format = 'NO_DOTS_DASH') {
  const parts = splitRut(value);
  if (!parts) return null;

  if (format === 'NO_DOTS_NO_DASH') return `${parts.body}${parts.dv}`;
  if (format === 'NO_DOTS_DASH') return `${parts.body}-${parts.dv}`;
  if (format === 'DOTS_DASH') {
    const reversed = parts.body.split('').reverse();
    const grouped = [];
    for (let i = 0; i < reversed.length; i += 3) {
      grouped.push(reversed.slice(i, i + 3).reverse().join(''));
    }
    return `${grouped.reverse().join('.')}-${parts.dv}`;
  }

  throw new Error(`Unsupported RUT format: ${format}`);
}

module.exports = {
  normalizeRut,
  splitRut,
  calculateDv,
  isValidRut,
  formatRut
};
