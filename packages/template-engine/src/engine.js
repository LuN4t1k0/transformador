const { parseNumber } = require('../../transformations/src/number');
const { parseDate } = require('../../transformations/src/date');
const {
  formatRut,
  isValidRut,
  transformText,
  transformNumber,
  formatDate,
  splitWords
} = require('../../transformations/src');

// A column's value is computed from its source using a per-row context: earlier output columns (by id and by
// name), the row index (for correlatives) and the processing date. Sources may only reference earlier columns,
// so a single ordered pass is enough.

class CellIssue extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function displayText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  return String(value);
}

function normalizeText(value) {
  return displayText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function emptyContext() {
  return { outputsById: new Map(), outputsByName: new Map(), rowIndex: 0, now: new Date() };
}

function resolveOperand(row, operand, context) {
  if (!operand || operand.type === 'EMPTY') return null;
  if (operand.type === 'COLUMN') return row[operand.column] ?? null;
  if (operand.type === 'OUTPUT') return context.outputsById.get(operand.columnId) ?? null;
  if (operand.type === 'NUMBER' || operand.type === 'TEXT') return operand.value;
  return resolveSource(row, operand, context);
}

function toNumber(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return value;
  const number = parseNumber(value);
  if (number === null) throw new CellIssue('INVALID_NUMBER', 'Value is not a recognizable number');
  return number;
}

function toDate(value) {
  if (isBlank(value)) return null;
  const date = parseDate(value, 'AUTO');
  if (!date) throw new CellIssue('INVALID_DATE', 'Value is not a recognizable date');
  return date;
}

function splitParts(value, delimiter) {
  if (isBlank(value)) return [];
  if (!delimiter) return splitWords(value);
  return String(value).split(delimiter).map((part) => part.trim()).filter(Boolean);
}

// ---- Calculations ----------------------------------------------------------------------------------------

const ROUNDERS = { ROUND: Math.round, FLOOR: Math.floor, CEIL: Math.ceil };

function roundValue(value, round) {
  const { mode = 'ROUND', decimals = 0 } = round || {};
  if (mode === 'NONE') return value;
  const factor = 10 ** decimals;
  return ROUNDERS[mode](Number((value * factor).toPrecision(15))) / factor;
}

function evaluateCalc(row, source, context) {
  const values = source.operands.map((operand) => toNumber(resolveOperand(row, operand, context)));
  const present = values.filter((value) => value !== null);
  let result = null;

  if (source.op === 'PERCENT') result = values[0] === null ? null : (values[0] * source.value) / 100;
  if (source.op === 'SUM') result = present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  if (source.op === 'AVERAGE') result = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  if (source.op === 'MIN') result = present.length ? Math.min(...present) : null;
  if (source.op === 'MAX') result = present.length ? Math.max(...present) : null;
  if (source.op === 'ABS') result = values[0] === null ? null : Math.abs(values[0]);
  if (['SUBTRACT', 'MULTIPLY', 'DIVIDE'].includes(source.op)) {
    if (values.some((value) => value === null)) return null;
    if (source.op === 'SUBTRACT') result = values.slice(1).reduce((total, value) => total - value, values[0]);
    if (source.op === 'MULTIPLY') result = values.reduce((total, value) => total * value, 1);
    if (source.op === 'DIVIDE') {
      if (values.slice(1).some((value) => value === 0)) throw new CellIssue('DIVISION_BY_ZERO', 'Division by zero');
      result = values.slice(1).reduce((total, value) => total / value, values[0]);
    }
  }
  return result === null ? null : roundValue(result, source.round);
}

// ---- Dates -----------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addMonths(date, months) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
}

function evaluateDate(row, source, context) {
  if (source.op === 'TODAY') return new Date(utcDay(context.now));
  const [first, second] = source.operands.map((operand) => resolveOperand(row, operand, context));

  if (source.op === 'DAYS_BETWEEN') {
    const [from, to] = [toDate(first), toDate(second)];
    if (!from || !to) return null;
    return Math.round((utcDay(to) - utcDay(from)) / DAY_MS) + (source.inclusive ? 1 : 0);
  }

  const date = toDate(first);
  if (!date) return null;
  if (source.op === 'ADD_DAYS') {
    const days = toNumber(second);
    return days === null ? null : new Date(utcDay(date) + Math.trunc(days) * DAY_MS);
  }
  if (source.op === 'ADD_MONTHS') {
    const months = toNumber(second);
    return months === null ? null : addMonths(date, Math.trunc(months));
  }
  if (source.op === 'YEAR') return date.getUTCFullYear();
  if (source.op === 'MONTH') return date.getUTCMonth() + 1;
  if (source.op === 'DAY') return date.getUTCDate();
  if (source.op === 'START_OF_MONTH') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  if (source.op === 'END_OF_MONTH') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  throw new Error(`Unsupported date operation: ${source.op}`);
}

// ---- Conditions ------------------------------------------------------------------------------------------

function compare(left, right) {
  const leftNumber = typeof left === 'number' ? left : isBlank(left) ? null : parseNumber(left);
  const rightNumber = typeof right === 'number' ? right : isBlank(right) ? null : parseNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;

  const leftDate = left instanceof Date ? left : isBlank(left) ? null : parseDate(left, 'AUTO');
  const rightDate = right instanceof Date ? right : isBlank(right) ? null : parseDate(right, 'AUTO');
  if (leftDate && rightDate) return utcDay(leftDate) - utcDay(rightDate);

  return normalizeText(left).localeCompare(normalizeText(right));
}

function conditionHolds(row, condition, context) {
  const left = resolveOperand(row, condition.left, context);
  if (condition.op === 'EMPTY') return isBlank(left);
  if (condition.op === 'NOT_EMPTY') return !isBlank(left);
  const right = resolveOperand(row, condition.right, context);
  if (condition.op === 'CONTAINS') return normalizeText(left).includes(normalizeText(right));
  if (condition.op === 'STARTS_WITH') return normalizeText(left).startsWith(normalizeText(right));
  if (condition.op === 'ENDS_WITH') return normalizeText(left).endsWith(normalizeText(right));
  if (condition.op === 'IN') return displayText(right).split(',').map(normalizeText).includes(normalizeText(left));
  if (isBlank(left) || isBlank(right)) return condition.op === 'NEQ' ? isBlank(left) !== isBlank(right) : condition.op === 'EQ' && isBlank(left) && isBlank(right);
  const order = compare(left, right);
  return { EQ: order === 0, NEQ: order !== 0, GT: order > 0, GTE: order >= 0, LT: order < 0, LTE: order <= 0 }[condition.op];
}

function evaluateCase(row, source, context) {
  for (const branch of source.cases) {
    const checks = branch.conditions.map((condition) => conditionHolds(row, condition, context));
    const matched = branch.match === 'ANY' ? checks.some(Boolean) : checks.every(Boolean);
    if (matched) return resolveOperand(row, branch.result, context);
  }
  return resolveOperand(row, source.otherwise, context);
}

// ---- Sources ---------------------------------------------------------------------------------------------

function resolveSource(row, source, context = emptyContext()) {
  if (!source || source.type === 'EMPTY') return null;
  if (source.type === 'COLUMN') return row[source.column];
  if (source.type === 'CONSTANT') return source.value;
  if (source.type === 'CONCAT') {
    const values = source.parts
      .map((part) => resolveOperand(row, part.type === 'CONSTANT' ? { type: 'TEXT', value: part.value } : part, context))
      .filter((value) => !isBlank(value))
      .map(displayText);
    return values.length ? values.join(source.separator ?? '') : null;
  }
  if (source.type === 'SPLIT_WORD') return splitParts(row[source.column], source.delimiter)[source.index] || null;
  if (source.type === 'SPLIT_WORD_RANGE') {
    const parts = splitParts(row[source.column], source.delimiter).slice(source.start || 0, source.end);
    return parts.join(source.delimiter || ' ') || null;
  }
  if (source.type === 'CALC') return evaluateCalc(row, source, context);
  if (source.type === 'DATE_CALC') return evaluateDate(row, source, context);
  if (source.type === 'CASE') return evaluateCase(row, source, context);
  if (source.type === 'COALESCE') {
    for (const operand of source.operands) {
      const value = resolveOperand(row, operand, context);
      if (!isBlank(value)) return value;
    }
    return null;
  }
  if (source.type === 'MAP') {
    const input = resolveOperand(row, source.input, context);
    const key = source.matchCase ? displayText(input).trim() : normalizeText(input);
    const entry = source.entries.find((candidate) => (source.matchCase ? candidate.from.trim() : normalizeText(candidate.from)) === key);
    if (entry) return entry.to;
    if (source.otherwise?.mode === 'EMPTY') return null;
    if (source.otherwise?.mode === 'TEXT') return source.otherwise.value;
    return input;
  }
  if (source.type === 'TEMPLATE') {
    const text = source.text.replace(/\{(@?)([^{}]+)\}/g, (_, isOutput, name) => displayText(isOutput ? context.outputsByName.get(name.trim()) : row[name.trim()]));
    return text.trim() === '' ? null : text;
  }
  if (source.type === 'ROW_NUMBER') return (source.start ?? 1) + context.rowIndex;
  throw new Error(`Unsupported source type: ${source.type}`);
}

// ---- Transformations and validations -----------------------------------------------------------------------

function applyTransformation(value, transformation) {
  if (transformation.type === 'RUT_FORMAT') return formatRut(value, transformation.format);
  if (transformation.type === 'TEXT') return transformText(value, transformation.operation);
  if (transformation.type === 'NUMBER') return transformNumber(value, transformation);
  if (transformation.type === 'DATE_FORMAT') return formatDate(value, transformation);
  if (isBlank(value)) return value;
  const text = displayText(value);
  if (transformation.type === 'REPLACE') return text.split(transformation.find).join(transformation.replace ?? '');
  if (transformation.type === 'PAD') {
    return transformation.side === 'RIGHT' ? text.padEnd(transformation.length, transformation.char) : text.padStart(transformation.length, transformation.char);
  }
  if (transformation.type === 'SUBSTRING') {
    const start = Math.max(0, transformation.start - 1);
    return text.substr(start, transformation.length ?? undefined) || null;
  }
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

// `context.rowIndex` (0-based position among processed rows) and `context.now` feed correlatives and TODAY.
function transformRow(row, template, { rowIndex = 0, now = new Date() } = {}) {
  const issues = [];
  const columns = [...template.columns].sort((a, b) => a.position - b.position);
  const context = { outputsById: new Map(), outputsByName: new Map(), rowIndex, now };
  const output = {};
  // Values before transformations (numbers stay numbers), used to sum, compare and sort rows.
  const raw = {};

  for (const column of columns) {
    let sourceValue;
    try {
      sourceValue = resolveSource(row, column.source, context);
    } catch (error) {
      if (!(error instanceof CellIssue)) throw error;
      issues.push({ column: column.outputName, rule: column.source.type, severity: 'error', code: error.code, message: error.message });
      output[column.outputName] = null;
      raw[column.outputName] = null;
      context.outputsById.set(column.id, null);
      context.outputsByName.set(column.outputName, null);
      continue;
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
      if (issue) issues.push({ column: column.outputName, rule: validation.type, ...issue });
    }

    output[column.outputName] = value;
    raw[column.outputName] = sourceValue ?? null;
    context.outputsById.set(column.id, value);
    context.outputsByName.set(column.outputName, value);
  }

  return { output, raw, issues };
}

module.exports = {
  CellIssue,
  isBlank,
  normalizeText,
  toNumber,
  compare,
  conditionHolds,
  resolveSource,
  applyTransformation,
  validateValue,
  transformRow,
  displayText
};
