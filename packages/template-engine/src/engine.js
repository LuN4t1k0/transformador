const { parseNumber } = require('../../transformations/src/number');
const {
  formatRut,
  isValidRut,
  transformText,
  transformNumber,
  formatDate,
  splitWords
} = require('../../transformations/src');

function resolveSource(row, source) {
  if (!source || source.type === 'EMPTY') return null;
  if (source.type === 'COLUMN') return row[source.column];
  if (source.type === 'CONSTANT') return source.value;
  if (source.type === 'CONCAT') {
    const values = source.parts
      .map((part) => resolveSource(row, part))
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
    return values.length ? values.join(source.separator ?? '') : null;
  }
  if (source.type === 'SPLIT_WORD') {
    const words = splitWords(row[source.column]);
    return words[source.index] || null;
  }
  if (source.type === 'SPLIT_WORD_RANGE') {
    const words = splitWords(row[source.column]);
    return words.slice(source.start || 0, source.end).join(' ') || null;
  }
  throw new Error(`Unsupported source type: ${source.type}`);
}

function applyTransformation(value, transformation) {
  if (transformation.type === 'RUT_FORMAT') return formatRut(value, transformation.format);
  if (transformation.type === 'TEXT') return transformText(value, transformation.operation);
  if (transformation.type === 'NUMBER') return transformNumber(value, transformation);
  if (transformation.type === 'DATE_FORMAT') return formatDate(value, transformation);
  throw new Error(`Unsupported transformation type: ${transformation.type}`);
}

// VALID_RUT checks the source value: the output may keep only part of the RUT (body or verifier).
function validateValue(value, validation, sourceValue = value) {
  if (validation.type === 'REQUIRED') {
    return value !== null && value !== undefined && value !== ''
      ? null
      : { severity: 'error', code: 'REQUIRED', message: 'Required value is missing' };
  }
  if (validation.type === 'VALID_RUT') {
    return isValidRut(sourceValue)
      ? null
      : { severity: 'error', code: 'INVALID_RUT', message: 'Invalid Chilean RUT' };
  }
  if (validation.type === 'INTEGER') {
    return Number.isInteger(Number(value))
      ? null
      : { severity: 'error', code: 'INVALID_INTEGER', message: 'Value must be an integer' };
  }
  return { severity: 'warning', code: 'UNKNOWN_VALIDATION', message: `Unknown validation ${validation.type}` };
}

const CONVERSION_ISSUES = {
  DATE_FORMAT: { code: 'INVALID_DATE', message: 'Value is not a recognizable date' },
  NUMBER: { code: 'INVALID_NUMBER', message: 'Value is not a recognizable number' },
  RUT_FORMAT: { code: 'INVALID_RUT_FORMAT', message: 'Value is not a recognizable RUT' }
};

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

const ROUNDERS = { ROUND: Math.round, FLOOR: Math.floor, CEIL: Math.ceil };

// Evaluates a CALC source. Returns { value } or { issue } with a user-facing code.
function evaluateCalc(row, source, outputsById) {
  const values = [];
  for (const operand of source.operands) {
    if (operand.type === 'NUMBER') {
      values.push(operand.value);
      continue;
    }
    const raw = operand.type === 'COLUMN' ? row[operand.column] : outputsById.get(operand.columnId);
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      values.push(null);
      continue;
    }
    const number = typeof raw === 'number' ? raw : parseNumber(raw);
    if (number === null) return { issue: { code: 'INVALID_NUMBER', message: 'Value is not a recognizable number' } };
    values.push(number);
  }

  const present = values.filter((value) => value !== null);
  let result = null;
  if (source.op === 'PERCENT') result = present.length ? (present[0] * source.value) / 100 : null;
  if (source.op === 'SUM') result = present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  if (source.op === 'AVERAGE') result = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  if (['SUBTRACT', 'MULTIPLY', 'DIVIDE'].includes(source.op)) {
    if (values.some((value) => value === null)) return { value: null };
    if (source.op === 'SUBTRACT') result = values.slice(1).reduce((total, value) => total - value, values[0]);
    if (source.op === 'MULTIPLY') result = values.reduce((total, value) => total * value, 1);
    if (source.op === 'DIVIDE') {
      if (values.slice(1).some((value) => value === 0)) return { issue: { code: 'DIVISION_BY_ZERO', message: 'Division by zero' } };
      result = values.slice(1).reduce((total, value) => total / value, values[0]);
    }
  }
  if (result === null) return { value: null };

  const { mode = 'ROUND', decimals = 0 } = source.round || {};
  if (mode !== 'NONE') {
    const factor = 10 ** decimals;
    result = ROUNDERS[mode](Number((result * factor).toPrecision(15))) / factor;
  }
  return { value: result };
}

function transformRow(row, template) {
  const output = {};
  const outputsById = new Map();
  const issues = [];
  const columns = [...template.columns].sort((a, b) => a.position - b.position);
  // Plain sources first, then calculations in column order, so calculations can use any earlier column.
  const ordered = [...columns.filter((column) => column.source?.type !== 'CALC'), ...columns.filter((column) => column.source?.type === 'CALC')];

  for (const column of ordered) {
    let sourceValue;
    if (column.source?.type === 'CALC') {
      const calc = evaluateCalc(row, column.source, outputsById);
      if (calc.issue) {
        issues.push({ column: column.outputName, rule: 'CALC', severity: 'error', ...calc.issue });
        output[column.outputName] = null;
        outputsById.set(column.id, null);
        continue;
      }
      sourceValue = calc.value;
    } else {
      sourceValue = resolveSource(row, column.source);
    }
    let value = sourceValue;

    // A conversion that turns a present value into nothing is a data problem, never a silent blank.
    let conversionIssue = null;
    for (const transformation of column.transformations || []) {
      const before = value;
      value = applyTransformation(value, transformation);
      if (!conversionIssue && !isBlank(before) && isBlank(value) && CONVERSION_ISSUES[transformation.type]) {
        conversionIssue = CONVERSION_ISSUES[transformation.type];
        issues.push({ column: column.outputName, rule: transformation.type, severity: 'error', ...conversionIssue });
      }
    }

    const validations = conversionIssue ? [] : [...(column.required ? [{ type: 'REQUIRED' }] : []), ...(column.validations || [])];
    for (const validation of validations) {
      const issue = validateValue(value, validation, sourceValue);
      if (issue) {
        issues.push({
          column: column.outputName,
          rule: validation.type,
          ...issue
        });
      }
    }

    output[column.outputName] = value;
    outputsById.set(column.id, value);
  }

  // Keep the output in file column order.
  const ordered_output = Object.fromEntries(columns.map((column) => [column.outputName, output[column.outputName]]));
  return { output: ordered_output, issues };
}

module.exports = {
  resolveSource,
  applyTransformation,
  validateValue,
  transformRow
};
