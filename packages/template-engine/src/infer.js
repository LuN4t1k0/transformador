const { transformRow } = require('./engine');
const { createTemplateFromHeaders, findHeader, normalizeHeader } = require('./mapping');
const { packKeys, packFormatDetectors, packDerivedFormats, packCompanionFormats } = require('./packs');
const { parseNumber } = require('../../transformations/src/number');

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

// Numbers are compared without binary noise, and "0,69%" equals the fraction Excel stores (0.0069).
function comparableNumber(number) {
  return String(Number(number.toPrecision(12)));
}

function comparable(value) {
  if (isBlank(value)) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  if (typeof value === 'number') return comparableNumber(value);
  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return comparableNumber(Number(text));
  if (/^-?[\d.,]+\s*%$/.test(text) && parseNumber(text) !== null) return comparableNumber(parseNumber(text));
  // Case and accents are not reproducible from mixed examples; compare text loosely.
  return normalizeHeader(text).toUpperCase();
}

// Where a file keeps the key that identifies rows (a RUT, a customer code…) according to the enabled packs:
// one column where most values are valid keys, or two adjacent columns that together are (a RUT split into
// its number and check digit).
function keyReader(headers, rows, key) {
  const shareOf = (read) => {
    const values = rows.map(read).filter((value) => !isBlank(value));
    return values.length ? values.filter((value) => key.key(value)).length / values.length : 0;
  };
  let best = null;
  const consider = (read, share, rank) => {
    if (share >= 0.8 && (!best || share > best.share || (share === best.share && rank < best.rank))) best = { read, share, rank };
  };
  headers.forEach((header, index) => {
    const single = (row) => row.values[header];
    consider(single, shareOf(single), 0);
    const next = headers[index + 1];
    if (next === undefined) return;
    const joined = (row) => (isBlank(row.values[header]) || isBlank(row.values[next]) ? null : `${String(row.values[header]).trim()}${String(row.values[next]).trim()}`);
    consider(joined, shareOf(joined), 1);
  });
  return best ? (row) => key.key(best.read(row)) : null;
}

function findKey(input, inputRows, outputHeaders, outputRows) {
  for (const key of packKeys()) {
    const inputKey = keyReader(input.headers, inputRows, key);
    const outputKey = keyReader(outputHeaders, outputRows, key);
    if (inputKey && outputKey) return { key, inputKey, outputKey };
  }
  return null;
}

// Loose tokens of a row: whole values plus the words and numbers inside texts, to tell whether two rows
// describe the same record even when the destination splits or reformats some fields.
function rowTokens(row) {
  const tokens = new Set();
  for (const value of Object.values(row.values)) {
    const whole = comparable(value);
    if (whole.length >= 3) tokens.add(whole);
    if (typeof value === 'string') for (const part of whole.split(/[^A-Z0-9]+/)) if (part.length >= 3) tokens.add(part);
  }
  return tokens;
}

// Pairing by position is only trusted when the paired rows visibly share data (same people in the same order);
// otherwise comparing them would teach and score nonsense.
function rowsCorrespond(pairs) {
  if (!pairs.length) return false;
  const matching = pairs.filter(({ input, output }) => {
    const inputTokens = rowTokens(input);
    return [...rowTokens(output)].filter((token) => inputTokens.has(token)).length >= 2;
  }).length;
  return matching / pairs.length >= 0.6;
}

// Pairs output example rows with input rows: by position when both files list the same rows in the same
// order, otherwise by a key (choosing, for repeated keys, the input row sharing most values). When nothing
// shows that the files share rows, there are no pairs.
function alignRows(input, outputRows, outputHeaders) {
  const inputRows = input?.rows || [];
  if (!inputRows.length || !outputRows.length) return { mode: 'NONE', pairs: [] };

  const positional = () => outputRows.slice(0, inputRows.length).map((row, index) => ({ output: row, input: inputRows[index] }));
  const found = findKey(input, inputRows, outputHeaders, outputRows);
  if (!found) {
    const pairs = positional();
    return rowsCorrespond(pairs) ? { mode: 'POSITION', pairs } : { mode: 'NONE', pairs: [] };
  }

  const count = Math.min(inputRows.length, outputRows.length);
  let sameOrder = 0;
  for (let index = 0; index < count; index += 1) {
    const key = found.inputKey(inputRows[index]);
    if (key && key === found.outputKey(outputRows[index])) sameOrder += 1;
  }
  if (count && sameOrder / count >= 0.8) return { mode: 'POSITION', pairs: positional() };

  const byKey = new Map();
  for (const row of inputRows) {
    const key = found.inputKey(row);
    if (key) byKey.set(key, [...(byKey.get(key) || []), row]);
  }
  const pairs = [];
  for (const row of outputRows) {
    const candidates = byKey.get(found.outputKey(row)) || [];
    if (!candidates.length) continue;
    const outputValues = new Set(Object.values(row.values).map(comparable).filter(Boolean));
    const shared = (candidate) => Object.values(candidate.values).map(comparable).filter((value) => outputValues.has(value)).length;
    pairs.push({ output: row, input: candidates.reduce((best, candidate) => (shared(candidate) > shared(best) ? candidate : best)) });
  }
  return pairs.length >= 2 ? { mode: 'KEY', key: found.key.label, pairs } : { mode: 'NONE', pairs: [] };
}

// Header names as comparable tokens, with common abbreviations and synonyms of payroll files.
const SYNONYMS = { fec: 'fecha', fch: 'fecha', ini: 'inicio', fin: 'termino', term: 'termino', lic: 'licencia', nom: 'nombre', nombres: 'nombre', apellidos: 'apellido', rem: 'remuneracion', dv: 'digito' };

function headerTokens(header) {
  return normalizeHeader(header)
    .split(/[^a-z0-9%]+/)
    .filter((token) => token && !/^\d+$/.test(token))
    .map((token) => SYNONYMS[token] || token);
}

function tokenMatch(a, b) {
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short) ? 0.8 : 0;
}

// Share of the output header's words found in the input header; `rank` also prefers input headers without
// extra words ("AFP" over "comision_afp" for "AFP 1").
function nameScore(outputName, inputHeader) {
  const outputTokens = headerTokens(outputName);
  const inputTokens = headerTokens(inputHeader);
  if (!outputTokens.length || !inputTokens.length) return { match: 0, rank: 0 };
  const matched = outputTokens.reduce((sum, token) => sum + Math.max(...inputTokens.map((other) => tokenMatch(token, other))), 0);
  const match = matched / outputTokens.length;
  return { match, rank: match - (inputTokens.length - 1) * 0.01 };
}

// Whether an input column can plausibly feed an output column with the detected format.
function isCompatible(format, inputColumn) {
  if (!inputColumn) return true;
  const physical = inputColumn.physical?.type;
  const semantic = inputColumn.semantic?.type;
  // Detectors classify numeric text as INTEGER/DECIMAL, so STRING here means non-numeric text.
  if (format.pack) return format.pack.semanticTypes?.includes(semantic) || physical === 'STRING';
  if (format.date) return physical === 'DATE' || semantic === 'YEAR_MONTH' || physical === 'INTEGER';
  if (format.number) return ['INTEGER', 'DECIMAL'].includes(physical);
  return true;
}

// Describes what the example values look like: a pack format (e.g. RUT), date, number, text case or a constant.
function detectFormat(values) {
  const present = values.filter((value) => !isBlank(value));
  const format = { pack: null, date: null, number: null, textCase: null, constant: null, required: values.length > 0 && present.length === values.length };
  if (!present.length) return format;

  if (present.length >= 2 && present.length === values.length && new Set(present.map(comparable)).size === 1) format.constant = String(present[0]).trim();
  if (present.every((value) => value instanceof Date)) {
    format.date = 'DD/MM/YYYY';
    return format;
  }

  const texts = present.map((value) => (value instanceof Date ? '' : String(value).trim()));
  const all = (pattern) => texts.every((text) => pattern.test(text));

  // Pack formats come in two stages: EARLY ones are unambiguous; LATE ones (plain digits) only apply once
  // dates are ruled out, and they also keep 8-digit dates from being claimed when a pack recognizes them.
  const early = detectPackFormat(texts, 'EARLY');
  const late = detectPackFormat(texts, 'LATE');

  if (early) format.pack = early;
  else if (all(/^\d{2}\/\d{2}\/\d{4}$/)) format.date = 'DD/MM/YYYY';
  else if (all(/^\d{2}-\d{2}-\d{4}$/)) format.date = 'DD-MM-YYYY';
  else if (all(/^\d{4}-\d{2}-\d{2}$/)) format.date = 'YYYY-MM-DD';
  else if (all(/^\d{2}\/\d{4}$/)) format.date = 'MM/YYYY';
  else if (all(/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/) && !late) format.date = 'YYYYMMDD';
  else if (all(/^(19|20)\d{2}(0[1-9]|1[0-2])$/)) format.date = 'YYYYMM';
  else if (late) format.pack = late;
  else if (present.every((value) => typeof value === 'number') || all(/^-?\d+([.,]\d+)?$/)) {
    const decimals = Math.max(...texts.map((text) => (text.split(/[.,]/)[1] || '').length));
    format.number = decimals === 0 ? { integer: true } : { fixedDecimals: decimals, decimalSeparator: texts.some((text) => text.includes(',')) ? ',' : '.' };
  }

  if (!format.pack && !format.date && !format.number) {
    const letters = texts.join('').replace(NAME_LETTERS, '');
    if (letters && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) format.textCase = 'UPPERCASE';
    else if (letters && letters === letters.toLowerCase() && letters !== letters.toUpperCase()) format.textCase = 'LOWERCASE';
  }
  return format;
}

function detectPackFormat(texts, stage) {
  for (const detector of packFormatDetectors(stage)) {
    const found = detector.detect(texts);
    if (found) return found;
  }
  return null;
}

function formatTransformations(format) {
  const transformations = [];
  const validations = [];
  if (format.pack) {
    transformations.push(...format.pack.transformations);
    validations.push(...(format.pack.validations || []));
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
    // Name parts go first: on a tie they win over plain word positions, since they handle compound surnames.
    for (const nameOrder of ['SURNAMES_FIRST', 'NAMES_FIRST']) {
      for (const part of ['PATERNAL', 'MATERNAL', 'NAMES', 'SURNAMES', 'FIRST_NAME']) candidates.push({ source: { type: 'NAME_PART', column: header, order: nameOrder, part }, order, rank: 1 });
    }
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

function numericSeries(values) {
  if (values.length < 3) return null;
  const numbers = values.map((value) => (typeof value === 'number' ? value : isBlank(value) ? null : parseNumber(value)));
  return numbers.every((number) => number !== null && Number.isFinite(number)) ? numbers : null;
}

function decimalsOf(numbers) {
  return Math.max(0, ...numbers.map((number) => (String(number).split('.')[1] || '').length));
}

const MIN_CALC_FIT = 0.85;

// Relations between columns of the destination example: X = A + B, or X = p% of A (rounded, ±1 tolerance).
// Returns { source, fit } where fit is the share of rows that match (exceptions such as zeros are tolerated).
function detectCalculation(targetIndex, series, columns, confident) {
  const target = series[targetIndex];
  const decimals = decimalsOf(target);
  const tolerance = decimals ? 1 / 10 ** decimals : 1;
  const round = { mode: 'ROUND', decimals };
  const rounded = (value) => Math.round(value * 10 ** decimals) / 10 ** decimals;
  const fits = (predict, row) => Math.abs(predict(row) - target[row]) <= tolerance;
  const fitOf = (predict) => target.filter((_, row) => fits(predict, row)).length / target.length;

  // Operands must come earlier in the file, or be later columns confidently read from the input file.
  const operand = (index) => {
    if (index < targetIndex) return { type: 'OUTPUT', columnId: columns[index].id };
    return columns[index].source.type === 'COLUMN' && confident(columns[index]) ? { type: 'COLUMN', column: columns[index].source.column } : null;
  };
  // Constant columns are not evidence of a relation: any similar number would "fit" them.
  const varies = (values) => new Set(values).size > 1;
  if (!varies(target)) return null;
  const candidates = series
    .map((values, index) => ({ values, index }))
    .filter((item) => item.values && item.index !== targetIndex && varies(item.values) && operand(item.index));

  let best = null;
  const consider = (fit, error, source) => {
    if (fit < MIN_CALC_FIT) return;
    if (!best || fit > best.fit || (fit === best.fit && error < best.error)) best = { fit, error, source };
  };

  for (let a = 0; a < candidates.length; a += 1) {
    for (let b = a + 1; b < candidates.length; b += 1) {
      const [first, second] = [candidates[a], candidates[b]];
      const fit = fitOf((row) => first.values[row] + second.values[row]);
      // Sums are preferred over percentages with the same fit (error 0 ranks first).
      consider(fit, -1, { type: 'CALC', op: 'SUM', operands: [operand(first.index), operand(second.index)], round });
    }
  }

  for (const candidate of candidates) {
    const ratios = target.map((value, row) => (candidate.values[row] && value ? value / candidate.values[row] : null)).filter((ratio) => ratio !== null);
    if (ratios.length < 3) continue;
    const median = [...ratios].sort((x, y) => x - y)[Math.floor(ratios.length / 2)];
    const percent = Number((median * 100).toFixed(2));
    if (!percent || percent === 100 || Math.abs(percent) > 1000) continue;
    const predict = (row) => rounded((candidate.values[row] * percent) / 100);
    const fit = fitOf(predict);
    // Error only over matching rows: exceptions (e.g. zeros) must not decide between candidates.
    const error = target.reduce((sum, value, row) => (fits(predict, row) ? sum + Math.abs((candidate.values[row] * percent) / 100 - value) : sum), 0);
    consider(fit, error, { type: 'CALC', op: 'PERCENT', value: percent, operands: [operand(candidate.index)], round });
  }
  return best;
}

function inferTemplate({ input = null, output = null, sheet } = {}) {
  if (!output) {
    const template = createTemplateFromHeaders(input?.headers || [], { sheet: sheet || input?.sheet });
    return { template, report: { mode: 'INPUT_ONLY', learned: 0, unresolved: [] } };
  }

  const names = uniqueNames(output.headers);
  const outputRows = (output.rows || []).slice(0, MAX_ROWS);
  const inputRows = (input?.rows || []).slice(0, MAX_ROWS);
  const { mode: alignment, key: alignmentKey, pairs } = alignRows(input ? { ...input, rows: inputRows } : null, outputRows, output.headers);
  const candidates = input ? candidateSources(input.headers, pairs.map((pair) => pair.input)) : [];
  const inputColumns = new Map((input?.columns || []).map((column) => [column.header, column]));
  // Sources to look for a value the destination repeats in every row, over the input's own rows (no pairing needed).
  let allRowCandidates = null;
  const constantFromInput = (outputName, formatSpec, constant) => {
    if (!inputRows.length) return null;
    allRowCandidates ||= candidateSources(input.headers, inputRows);
    const expected = inputRows.map(() => constant);
    let best = null;
    for (const spec of [formatSpec, ...packDerivedFormats()]) {
      for (const candidate of allRowCandidates) {
        const score = scoreCandidate(candidate, outputName, spec, inputRows, expected);
        if (!score) continue;
        const key = [score, -candidate.rank, nameSimilarity(outputName, candidate.source.column), -candidate.order];
        if (!best || isBetter(key, best.key)) best = { candidate, score, key, spec };
      }
    }
    return best;
  };
  // Without paired rows, a column found by name takes the format whose results look like the destination's values
  // (same shape: "12345678" vs "12.345.678-5"), so a full RUT can feed a column that only has its number.
  const shape = (value) => String(value).trim().replace(/\d+/g, '9').replace(/[A-Za-zÀ-ÿ]+/g, 'A');
  const shapedSpec = (header, outputName, formatSpec, values) => {
    if (!inputRows.length) return formatSpec;
    const targets = new Set(values.filter((value) => !isBlank(value)).map(shape));
    const fit = (spec) => {
      const column = { id: 'shape', position: 1, outputName, required: false, source: { type: 'COLUMN', column: header }, ...spec };
      const results = inputRows.map((row) => {
        try {
          return transformRow(row.values, { columns: [column] }).output[outputName];
        } catch {
          return null;
        }
      }).filter((value) => !isBlank(value));
      return results.length ? results.filter((value) => targets.has(shape(value))).length / inputRows.filter((row) => !isBlank(row.values[header])).length : 0;
    };
    let best = { spec: formatSpec, score: fit(formatSpec) };
    for (const spec of packDerivedFormats()) {
      const score = fit(spec);
      if (score > best.score) best = { spec, score };
    }
    return best.spec;
  };
  // A fixed value is never taken as learned: the next file may bring another employer or period.
  const asConstant = (column, outputName, value) => {
    report.suggested.push(outputName);
    report.byName[outputName] = { method: 'CONSTANT' };
    return { ...column, source: { type: 'CONSTANT', value }, transformations: [], validations: [] };
  };
  const report = { mode: input ? 'BY_EXAMPLE' : 'OUTPUT_ONLY', alignment, ...(alignmentKey ? { alignmentKey } : {}), pairs: pairs.length, learned: 0, suggested: [], unresolved: [], byName: {} };

  const columns = names.map((outputName, index) => {
    const originalHeader = output.headers[index];
    const valueOf = (row) => row.values[originalHeader] ?? row.values[outputName] ?? null;
    const values = outputRows.map(valueOf);
    const format = detectFormat(values);
    const formatSpec = formatTransformations(format);
    const column = { id: slug(outputName, index), position: index + 1, outputName, required: format.required, aliases: [], source: { type: 'EMPTY' }, ...formatSpec };

    if (values.every(isBlank)) {
      report.unresolved.push(outputName);
      return { ...column, transformations: [], validations: [] };
    }

    // 1. By example: the source + format that reproduces the paired rows.
    if (pairs.length) {
      const expected = pairs.map((pair) => valueOf(pair.output));
      const pairedInputs = pairs.map((pair) => pair.input);
      const findBest = (spec) => {
        let best = null;
        for (const candidate of candidates) {
          const score = scoreCandidate(candidate, outputName, spec, pairedInputs, expected);
          const key = [score, -candidate.rank, nameSimilarity(outputName, candidate.source.column), -candidate.order];
          if (!best || isBetter(key, best.key)) best = { candidate, score, key, spec };
        }
        return best;
      };
      let best = findBest(formatSpec);
      // Parts of a value that packs know how to derive (e.g. a RUT's number or check digit alone) are only
      // tried when the value's own format does not reproduce the example.
      if (!best || best.score < MIN_SCORE) {
        for (const derived of packDerivedFormats()) {
          const found = findBest(derived);
          if (found && found.score >= MIN_SCORE && (!best || found.score > best.score)) best = found;
        }
      }
      const compared = expected.filter((value) => !isBlank(value)).length;
      if (best && best.score >= MIN_SCORE && compared >= Math.min(2, pairs.length)) {
        report.learned += 1;
        report.byName[outputName] = { method: 'EXAMPLE', score: best.score };
        return { ...column, ...best.spec, source: best.candidate.source, reviewed: true };
      }
    }

    // A value repeated in every example row (the same employer in all of them) comes from the input column that
    // holds it, when there is one: a template reads the data, it does not copy this example's values.
    if (input && format.constant !== null) {
      const found = constantFromInput(outputName, formatSpec, format.constant);
      if (found) {
        if (found.score === 1) report.learned += 1;
        else report.suggested.push(outputName);
        report.byName[outputName] = { method: 'FROM_INPUT', score: found.score };
        return { ...column, ...found.spec, source: found.candidate.source, reviewed: found.score === 1 };
      }
    }

    // Without an input file, a repeated value can only be a fixed value, to be reviewed.
    if (!input && format.constant !== null) return asConstant(column, outputName, format.constant);

    // 2. Same header name in the input.
    const exact = input ? findHeader(outputName, input.headers) : outputName;
    if (exact) {
      report.learned += 1;
      report.byName[outputName] = { method: input ? 'NAME' : 'OUTPUT_NAME' };
      return { ...column, ...shapedSpec(exact, outputName, formatSpec, values), source: { type: 'COLUMN', column: exact } };
    }


    // 3. Similar header name with a compatible format: a suggestion the user must review.
    if (input) {
      const ranked = input.headers
        .map((header) => ({ header, ...nameScore(outputName, header) }))
        .filter((item) => item.match >= 0.5 && isCompatible(format, inputColumns.get(item.header)))
        .sort((a, b) => b.rank - a.rank);
      if (ranked.length && (ranked.length === 1 || ranked[0].rank > ranked[1].rank)) {
        report.suggested.push(outputName);
        report.byName[outputName] = { method: 'SIMILAR_NAME', score: ranked[0].match };
        return { ...column, ...shapedSpec(ranked[0].header, outputName, formatSpec, values), source: { type: 'COLUMN', column: ranked[0].header } };
      }
    }

    // 4. The same value in every example row and in no input column: a fixed value, to be reviewed.
    if (format.constant !== null) return asConstant(column, outputName, format.constant);

    report.unresolved.push(outputName);
    return column;
  });

  // An unresolved column that a pack pairs with the one before it (a "DV" right after a RUT number) takes that
  // part of the same source; a suggestion to review, since the rows could not confirm it.
  const plainHeader = (index) => String((output.columns || []).find((column) => column.header === output.headers[index])?.label || names[index]).replace(/\s*\(\d+\)$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  columns.forEach((column, index) => {
    if (!index || column.source.type !== 'EMPTY' || !report.unresolved.includes(column.outputName)) return;
    const previous = columns[index - 1];
    const companion = packCompanionFormats().find((item) => item.header.test(plainHeader(index))
      && (previous.transformations || []).some((transformation) => Object.entries(item.after).every(([key, value]) => transformation[key] === value)));
    if (!companion || previous.source.type === 'EMPTY' || previous.source.type === 'CONSTANT') return;
    columns[index] = { ...column, ...companion.spec, source: previous.source };
    report.unresolved = report.unresolved.filter((name) => name !== column.outputName);
    report.suggested.push(column.outputName);
    report.byName[column.outputName] = { method: 'COMPANION' };
  });

  // Unresolved numeric columns may be calculations over other columns of the example (e.g. TOTAL = 10% + ADICIONAL).
  const series = names.map((outputName, index) => numericSeries(outputRows.map((row) => row.values[output.headers[index]] ?? row.values[outputName] ?? null)));
  // A relation that holds on every row beats a similar-name guess; partial fits are offered as suggestions.
  columns.forEach((column, index) => {
    const method = report.byName[column.outputName]?.method;
    const replaceable = column.source.type === 'EMPTY' || method === 'SIMILAR_NAME';
    if (!replaceable || !series[index]) return;
    const found = detectCalculation(index, series, columns, (other) => ['NAME', 'EXAMPLE'].includes(report.byName[other.outputName]?.method));
    if (!found || (method === 'SIMILAR_NAME' && found.fit < 1)) return;

    columns[index] = { ...column, source: found.source, transformations: [], validations: [], reviewed: found.fit === 1 };
    report.unresolved = report.unresolved.filter((name) => name !== column.outputName);
    report.suggested = report.suggested.filter((name) => name !== column.outputName);
    if (found.fit === 1) {
      report.learned += 1;
      report.byName[column.outputName] = { method: 'CALC' };
    } else {
      report.suggested.push(column.outputName);
      report.byName[column.outputName] = { method: 'CALC', fit: found.fit, exceptions: Math.round((1 - found.fit) * series[index].length) };
    }
  });

  // Columns the destination shows as a percentage keep the number (0.0069) and the Excel percentage format, so
  // the file shows 0,69% and the value still adds up; a number format would turn it into text.
  const percentHeaders = new Set([...(output.percentHeaders || []), ...(output.columns || []).filter((column) => column.display === 'PERCENT').map((column) => column.header)]);
  // A header the destination repeats (DV after each RUT) keeps a unique name here ("DV (2)") and writes its own text.
  const labels = new Map([...(output.headerLabels || []), ...(output.columns || []).filter((column) => column.label).map((column) => [column.header, column.label])]);
  const withDisplay = columns.map((column, index) => {
    const label = labels.get(output.headers[index]);
    const named = label ? { ...column, header: label } : column;
    if (!percentHeaders.has(output.headers[index])) return named;
    return { ...named, cellFormat: 'PERCENT', transformations: (named.transformations || []).filter((transformation) => transformation.type !== 'NUMBER') };
  });

  const template = {
    name: 'Nueva plantilla',
    input: { headerRow: 1, ...(input?.sheet ? { sheet: input.sheet } : {}) },
    output: { format: 'XLSX', sheetName: String(output.sheet || 'DATOS').slice(0, 31) },
    columns: withDisplay
  };
  return { template, report };
}

module.exports = { detectFormat, inferTemplate, alignRows, comparable };
