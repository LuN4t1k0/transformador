function excelSerialToDate(serial) {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + numeric * 24 * 60 * 60 * 1000);
}

function parseDate(value, inputFormat) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;

  const text = String(value).trim();

  if (inputFormat === 'EXCEL_SERIAL') return excelSerialToDate(text);

  if (inputFormat === 'DD-MM-YYYY' || inputFormat === 'DD/MM/YYYY') {
    const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  }

  if (inputFormat === 'YYYYMM') {
    const match = text.match(/^(\d{4})(\d{2})$/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  }

  throw new Error(`Unsupported date input format: ${inputFormat}`);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(value, options) {
  const date = parseDate(value, options.inputFormat);
  if (!date) return null;

  if (options.outputFormat === 'DD/MM/YYYY') {
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
  }

  if (options.outputFormat === 'YYYY-MM-DD') {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  throw new Error(`Unsupported date output format: ${options.outputFormat}`);
}

module.exports = { excelSerialToDate, parseDate, formatDate };
