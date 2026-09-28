const DAY_MS = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
// Excel serials between 1900-01-01 and 2099-12-31.
const MAX_EXCEL_SERIAL = 73050;

function utcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isValid ? date : null;
}

function excelSerialToDate(serial) {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) return null;
  return new Date(EXCEL_EPOCH + Math.floor(numeric) * DAY_MS);
}

const PARSERS = {
  'DD-MM-YYYY': (text) => {
    const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    return match ? utcDate(Number(match[3]), Number(match[2]), Number(match[1])) : null;
  },
  'YYYY-MM-DD': (text) => {
    const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    return match ? utcDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  },
  YYYYMMDD: (text) => {
    const match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    return match ? utcDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  },
  YYYYMM: (text) => {
    const match = text.match(/^(\d{4})(\d{2})$/);
    return match ? utcDate(Number(match[1]), Number(match[2]), 1) : null;
  },
  EXCEL_SERIAL: (text) => (/^\d+(\.\d+)?$/.test(text) ? excelSerialToDate(text) : null)
};
PARSERS['DD/MM/YYYY'] = PARSERS['DD-MM-YYYY'];

function parseAuto(value) {
  if (typeof value === 'number') {
    const text = String(Math.trunc(value));
    if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(text)) return PARSERS.YYYYMM(text);
    if (/^(19|20)\d{6}$/.test(text)) return PARSERS.YYYYMMDD(text);
    return value >= 1 && value <= MAX_EXCEL_SERIAL ? excelSerialToDate(value) : null;
  }
  const text = String(value).trim();
  return PARSERS['DD-MM-YYYY'](text) || PARSERS['YYYY-MM-DD'](text) || PARSERS.YYYYMMDD(text) || PARSERS.YYYYMM(text);
}

function parseDate(value, inputFormat = 'AUTO') {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === '') return null;
  if (inputFormat === 'AUTO') return parseAuto(value);

  const parser = PARSERS[inputFormat];
  if (!parser) throw new Error(`Unsupported date input format: ${inputFormat}`);
  return parser(String(value).trim());
}

function pad(value) {
  return String(value).padStart(2, '0');
}

const FORMATTERS = {
  'DD/MM/YYYY': (d, m, y) => `${d}/${m}/${y}`,
  'DD-MM-YYYY': (d, m, y) => `${d}-${m}-${y}`,
  'YYYY-MM-DD': (d, m, y) => `${y}-${m}-${d}`,
  YYYYMMDD: (d, m, y) => `${y}${m}${d}`,
  DDMMYYYY: (d, m, y) => `${d}${m}${y}`,
  YYYYMM: (d, m, y) => `${y}${m}`,
  'MM/YYYY': (d, m, y) => `${m}/${y}`
};

const DATE_INPUT_FORMATS = ['AUTO', 'DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'YYYYMMDD', 'YYYYMM', 'EXCEL_SERIAL'];
const DATE_OUTPUT_FORMATS = Object.keys(FORMATTERS);

function formatDate(value, options) {
  const formatter = FORMATTERS[options.outputFormat];
  if (!formatter) throw new Error(`Unsupported date output format: ${options.outputFormat}`);
  const date = parseDate(value, options.inputFormat || 'AUTO');
  if (!date) return null;
  return formatter(pad(date.getUTCDate()), pad(date.getUTCMonth() + 1), date.getUTCFullYear());
}

module.exports = { excelSerialToDate, parseDate, formatDate, DATE_INPUT_FORMATS, DATE_OUTPUT_FORMATS };
