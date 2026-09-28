const { transformRow } = require('./engine');
const { createTemplateFromHeaders, findHeader, normalizeHeader } = require('./mapping');
const { isValidRut } = require('../../transformations/src/rut');

// Learns a template by example: given rows of the file users receive (input) and rows of the file the
// destination expects (output), finds for every output column the source and format that reproduce it.

const MAX_ROWS = 30;
const MIN_SCORE = 0.8;
const NAME_LETTERS = /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g;

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function comparable(value) {
  if (isBlank(value)) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  if (typeof value === 'number') return String(value);
  const text = String(value).trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? String(Number(text)) : text;
}

// Describes what the example values look like: RUT/date/number/text case, or a constant.
function detectFormat(values) {
  const present = values.filter((value) => !isBlank(value));
  const format = { rut: null, date: null, number: null, textCase: null, constant: null, required: values.length > 0 && present.length === values.length };
  if (!present.length) return format;

  if (present.length >= 2 && present.length === values.length && new Set(present.map(comparable)).size === 1) format.constant = String(present[0]).trim();
  if (present.every((value) => value instanceof Date)) {
    format.date = 'DD/MM/YYYY';
    return format;
  }

  const texts = present.map((value) => (value instanceof Date ? '' : String(value).trim()));
  const all = (pattern) => texts.every((text) => pattern.test(text));

  if (all(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/)) format.rut = 'DOTS_DASH';
  else if (all(/^\d{7,8}-[\dkK]$/)) format.rut = 'NO_DOTS_DASH';
  else if (all(/^\d{2}\/\d{2}\/\d{4}$/)) format.date = 'DD/MM/YYYY';
  else if (all(/^\d{2}-\d{2}-\d{4}$/)) format.date = 'DD-MM-YYYY';
  else if (all(/^\d{4}-\d{2}-\d{2}$/)) format.date = 'YYYY-MM-DD';
  else if (all(/^\d{2}\/\d{4}$/)) format.date = 'MM/YYYY';
  else if (all(/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/) && !texts.every((text) => isValidRut(text))) format.date = 'YYYYMMDD';
  else if (all(/^(19|20)\d{2}(0[1-9]|1[0-2])$/)) format.date = 'YYYYMM';
  else if (all(/^\d{7,9}$/) && texts.every((text) => isValidRut(text))) format.rut = 'NO_DOTS_NO_DASH';
  else if (present.every((value) => typeof value === 'number') || all(/^-?\d+([.,]\d+)?$/)) {
    const decimals = Math.max(...texts.map((text) => (text.split(/[.,]/)[1] || '').length));
    format.number = decimals === 0 ? { integer: true } : { fixedDecimals: decimals, decimalSeparator: texts.some((text) => text.includes(',')) ? ',' : '.' };
  }

  if (!format.rut && !format.date && !format.number) {
    const letters = texts.join('').replace(NAME_LETTERS, '');
    if (letters && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) format.textCase = 'UPPERCASE';
    else if (letters && letters === letters.toLowerCase() && letters !== letters.toUpperCase()) format.textCase = 'LOWERCASE';
  }
  return format;
}

function formatTransformations(format) {
  const transformations = [];
  const validations = [];
  if (format.rut) {
    transformations.push({ type: 'RUT_FORMAT', format: format.rut });
    validations.push({ type: 'VALID_RUT' });
  } else if (format.date) {
    transformations.push({ type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: format.date });
  } else if (format.number) {
    transformations.push({ type: 'NUMBER', ...format.number });
  } else if (format.textCase) {
    transformations.push({ type: 'TEXT', operation: 'NORMALIZE_SPACES' }, { type: 'TEXT', operation: format.textCase });
  }
  return { transformations, validations };
}

function candidateSources(headers, rows) {
  const candidates = [];
  headers.forEach((header, order) => {
    candidates.push({ source: { type: 'COLUMN', column: header }, order, rank: 0 });
    const hasWords = rows.some((row) => typeof row.values[header] === 'string' && /\s/.test(row.values[header].trim()));
    if (!hasWords) return;
    for (let index = 0; index < 4; index += 1) candidates.push({ source: { type: 'SPLIT_WORD', column: header, index }, order, rank: 1 });
    for (let start = 1; start < 4; start += 1) candidates.push({ source: { type: 'SPLIT_WORD_RANGE', column: header, start }, order, rank: 2 });
  });
  return candidates;
}

function nameSimilarity(a, b) {
  const x = normalizeHeader(a).replace(/[^a-z0-9]/g, '');
  const y = normalizeHeader(b).replace(/[^a-z0-9]/g, '');
  if (!x || !y) return 0;
  return x === y ? 2 : x.includes(y) || y.includes(x) ? 1 : 0;
}

// Scores how many example rows a candidate source + format reproduces.
function scoreCandidate(candidate, outputName, formatSpec, inputRows, expected) {
  const column = { id: 'candidate', position: 1, outputName, required: false, source: candidate.source, ...formatSpec };
  let compared = 0;
  let matches = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const target = comparable(expected[index]);
    if (!target) continue;
    compared += 1;
    let value;
    try {
      value = transformRow(inputRows[index].values, { columns: [column] }).output[outputName];
    } catch {
      value = null;
    }
    if (comparable(value) === target) matches += 1;
  }
  return compared ? matches / compared : 0;
}

// Lexicographic comparison of ranking keys: higher score, simpler source, closer name, earlier column.
function isBetter(key, other) {
  for (let index = 0; index < key.length; index += 1) {
    if (key[index] !== other[index]) return key[index] > other[index];
  }
  return false;
}

function uniqueNames(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = String(header ?? '').trim() || `Columna ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });
}

function slug(value, index) {
  return `${normalizeHeader(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'columna'}_${index + 1}`;
}

function inferTemplate({ input = null, output = null, sheet } = {}) {
  if (!output) {
    const template = createTemplateFromHeaders(input?.headers || [], { sheet: sheet || input?.sheet });
    return { template, report: { mode: 'INPUT_ONLY', learned: 0, unresolved: [] } };
  }

  const names = uniqueNames(output.headers);
  const outputRows = (output.rows || []).slice(0, MAX_ROWS);
  const inputRows = (input?.rows || []).slice(0, MAX_ROWS);
  const aligned = Math.min(outputRows.length, inputRows.length);
  const candidates = input ? candidateSources(input.headers, inputRows) : [];
  const report = { mode: input ? 'BY_EXAMPLE' : 'OUTPUT_ONLY', learned: 0, unresolved: [], byName: {} };

  const columns = names.map((outputName, index) => {
    const originalHeader = output.headers[index];
    const values = outputRows.map((row) => row.values[originalHeader] ?? row.values[outputName] ?? null);
    const format = detectFormat(values);
    const formatSpec = formatTransformations(format);
    const column = { id: slug(outputName, index), position: index + 1, outputName, required: format.required, aliases: [], source: { type: 'EMPTY' }, ...formatSpec };

    if (values.every(isBlank)) {
      report.unresolved.push(outputName);
      return { ...column, transformations: [], validations: [] };
    }

    if (aligned) {
      const expected = values.slice(0, aligned);
      let best = null;
      for (const candidate of candidates) {
        const score = scoreCandidate(candidate, outputName, formatSpec, inputRows, expected);
        const key = [score, -candidate.rank, nameSimilarity(outputName, candidate.source.column), -candidate.order];
        if (!best || isBetter(key, best.key)) best = { candidate, score, key };
      }
      if (best && best.score >= MIN_SCORE) {
        report.learned += 1;
        report.byName[outputName] = { method: 'EXAMPLE', score: best.score };
        return { ...column, source: best.candidate.source, reviewed: true };
      }
    }

    if (format.constant !== null && !(input && findHeader(outputName, input.headers))) {
      report.learned += 1;
      report.byName[outputName] = { method: 'CONSTANT' };
      return { ...column, source: { type: 'CONSTANT', value: format.constant }, transformations: [], validations: [] };
    }

    const byName = input ? findHeader(outputName, input.headers) : outputName;
    if (byName) {
      report.learned += 1;
      report.byName[outputName] = { method: input ? 'NAME' : 'OUTPUT_NAME' };
      return { ...column, source: { type: 'COLUMN', column: byName } };
    }

    report.unresolved.push(outputName);
    return column;
  });

  const template = {
    name: 'Nueva plantilla',
    input: { headerRow: 1, ...(input?.sheet ? { sheet: input.sheet } : {}) },
    output: { format: 'XLSX', sheetName: String(output.sheet || 'DATOS').slice(0, 31) },
    columns
  };
  return { template, report };
}

module.exports = { detectFormat, inferTemplate };
