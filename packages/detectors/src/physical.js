const { parseNumber, parseDate } = require('../../transformations/src');

function detectPhysicalType(values) {
  const samples = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (samples.length === 0) return { type: 'EMPTY', confidence: 1, sampleSize: 0, validSamples: 0 };

  const checks = [
    { type: 'INTEGER', test: (value) => Number.isInteger(parseNumber(value)) },
    { type: 'DECIMAL', test: (value) => parseNumber(value) !== null },
    { type: 'DATE', test: (value) => ['DD-MM-YYYY', 'DD/MM/YYYY', 'YYYYMM', 'EXCEL_SERIAL'].some((format) => parseDate(value, format)) },
    { type: 'BOOLEAN', test: (value) => /^(true|false|si|no|sí|0|1)$/i.test(String(value).trim()) },
    { type: 'STRING', test: () => true }
  ];

  let best = { type: 'STRING', confidence: 1, sampleSize: samples.length, validSamples: samples.length };
  for (const check of checks) {
    const validSamples = samples.filter(check.test).length;
    const confidence = validSamples / samples.length;
    if (confidence >= 0.9) {
      best = { type: check.type, confidence, sampleSize: samples.length, validSamples };
      break;
    }
  }

  return best;
}

module.exports = { detectPhysicalType };
