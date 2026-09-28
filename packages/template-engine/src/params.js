const { parseNumber } = require('../../transformations/src/number');
const { parseDate } = require('../../transformations/src/date');

// Values a template asks for when generating (a period, a company code, a processing date…).
// They are typed once, stored with the job and available to every row.

const PARAMETER_TYPES = ['TEXT', 'NUMBER', 'DATE'];

class ParameterError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_PARAMETERS';
  }
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Converts what the user typed into the stored form: text, number or YYYY-MM-DD. Returns null when blank.
function parseParameterValue(parameter, value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (parameter.type === 'NUMBER') {
    const number = typeof value === 'number' ? value : parseNumber(String(value).trim());
    if (number === null || !Number.isFinite(number)) throw new ParameterError(`«${parameter.name}» debe ser un número.`);
    return number;
  }
  if (parameter.type === 'DATE') {
    const date = value instanceof Date ? value : parseDate(String(value).trim(), 'AUTO');
    if (!date) throw new ParameterError(`«${parameter.name}» debe ser una fecha, por ejemplo 31-05-2024.`);
    return isoDay(date);
  }
  return String(value).trim().slice(0, 500);
}

// Checks the values sent with a transformation: known parameters only, required ones present, right types.
// Blank values fall back to the parameter's default.
function validateRunParameters(parameters = [], values = {}) {
  const stored = {};
  for (const parameter of parameters) {
    const typed = values?.[parameter.id];
    const value = parseParameterValue(parameter, typed === undefined || typed === null || String(typed).trim() === '' ? parameter.defaultValue : typed);
    if (value === null && parameter.required) throw new ParameterError(`Falta el valor de «${parameter.name}».`);
    stored[parameter.id] = value;
  }
  return stored;
}

// Stored values (or defaults, for previews) as the engine uses them: dates become Date objects.
function runtimeParameters(parameters = [], stored = {}) {
  const byId = new Map();
  const byName = new Map();
  for (const parameter of parameters) {
    let value = stored[parameter.id];
    if (value === undefined || value === null || value === '') {
      try {
        value = parseParameterValue(parameter, parameter.defaultValue);
      } catch {
        value = null;
      }
    }
    if (parameter.type === 'DATE' && typeof value === 'string') value = parseDate(value, 'YYYY-MM-DD');
    byId.set(parameter.id, value ?? null);
    byName.set(parameter.name, value ?? null);
  }
  return { byId, byName };
}

// For previews: whatever was typed so far, ignoring values that are not valid yet (defaults apply instead).
function previewParameters(parameters = [], typed = {}) {
  const stored = {};
  for (const parameter of parameters) {
    try {
      stored[parameter.id] = parseParameterValue(parameter, typed?.[parameter.id]);
    } catch {
      stored[parameter.id] = null;
    }
  }
  return runtimeParameters(parameters, stored);
}

// Parameters referenced by a node: PARAM operands and {$Name} placeholders in texts.
function parameterReferences(node) {
  const ids = [];
  const names = [];
  const visit = (current) => {
    if (typeof current === 'string') {
      for (const match of current.matchAll(/\{\$([^{}|:]+)[^{}]*\}/g)) names.push(match[1].trim());
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current.type === 'PARAM') ids.push(current.paramId);
    Object.values(current).forEach(visit);
  };
  visit(node);
  return { ids, names };
}

module.exports = { PARAMETER_TYPES, ParameterError, parseParameterValue, validateRunParameters, runtimeParameters, previewParameters, parameterReferences };
