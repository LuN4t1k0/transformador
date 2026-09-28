const { DATE_INPUT_FORMATS, DATE_OUTPUT_FORMATS } = require('../../transformations/src/date');
const { PARAMETER_TYPES, ParameterError, parseParameterValue, parameterReferences } = require('./params');

// Whitelist-based validation for user-authored templates. Anything not listed here is rejected or dropped,
// so a template can never carry code, formulas or unknown operations.

const MAX_COLUMNS = 200;
const MAX_TEXT = 200;
const MAX_WIDTH = 1000;

const OUTPUT_FORMATS = ['XLSX', 'DELIMITED', 'FIXED_WIDTH'];
const DELIMITERS = [';', ',', '|', '\t'];
const EXTENSIONS = ['csv', 'txt'];
const ENCODINGS = ['UTF-8', 'LATIN1'];
const LINE_ENDINGS = ['CRLF', 'LF'];
const RUT_FORMATS = ['NO_DOTS_NO_DASH', 'NO_DOTS_DASH', 'DOTS_DASH', 'BODY', 'DV'];
const TEXT_OPERATIONS = ['TRIM', 'UPPERCASE', 'LOWERCASE', 'NORMALIZE_SPACES', 'REMOVE_ACCENTS', 'TITLE_CASE', 'DIGITS_ONLY'];
const VALIDATIONS = ['VALID_RUT', 'INTEGER'];
const CALC_OPERATIONS = ['PERCENT', 'SUM', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'AVERAGE', 'MIN', 'MAX', 'ABS'];
const SINGLE_OPERAND_CALCS = ['PERCENT', 'ABS'];
const CONDITION_OPERATORS = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'IN', 'EMPTY', 'NOT_EMPTY'];
const DATE_OPERATIONS = { DAYS_BETWEEN: 2, ADD_DAYS: 2, ADD_MONTHS: 2, YEAR: 1, MONTH: 1, DAY: 1, START_OF_MONTH: 1, END_OF_MONTH: 1, TODAY: 0 };
const MAX_MAP_ENTRIES = 1000;
const ROUND_MODES = ['ROUND', 'FLOOR', 'CEIL', 'NONE'];
const AGGREGATES = ['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX', 'FIRST', 'LAST', 'CONCAT'];
const TOTAL_OPERATIONS = ['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX'];
const CELL_FORMATS = ['NUMBER', 'NUMBER_2', 'PERCENT', 'DATE', 'TEXT'];
const SPLIT_MODES = ['SHEETS', 'FILES'];
const MAX_PARAMETERS = 20;
const MAX_DESIGN_LINES = 10;
const SORT_DIRECTIONS = ['ASC', 'DESC'];

class TemplateValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_TEMPLATE';
  }
}

function fail(message) {
  throw new TemplateValidationError(message);
}

function text(value, label, { required = false, max = MAX_TEXT } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`Falta ${label}.`);
    return '';
  }
  if (typeof value !== 'string') fail(`${label} debe ser texto.`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`Falta ${label}.`);
  if (trimmed.length > max) fail(`${label} supera ${max} caracteres.`);
  return trimmed;
}

function oneOf(value, allowed, message) {
  if (!allowed.includes(value)) fail(message);
  return value;
}

function integer(value, label, { min = 0, max = 50 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} debe ser un entero entre ${min} y ${max}.`);
  return value;
}

function normalizeOutput(output = {}) {
  const format = oneOf(String(output.format || 'XLSX').toUpperCase(), OUTPUT_FORMATS, 'El formato de salida no es válido.');
  if (format === 'XLSX') {
    const sheetName = text(output.sheetName || 'DATOS', 'el nombre de la hoja de salida', { max: 31 });
    if (/[\\/?*[\]:]/.test(sheetName)) fail('El nombre de la hoja de salida no puede contener \\ / ? * [ ] :');
    return { format, sheetName };
  }

  const common = {
    extension: oneOf(output.extension || (format === 'DELIMITED' ? 'csv' : 'txt'), EXTENSIONS, 'La extensión del archivo no es válida.'),
    includeHeaders: typeof output.includeHeaders === 'boolean' ? output.includeHeaders : format === 'DELIMITED',
    encoding: oneOf(output.encoding || 'UTF-8', ENCODINGS, 'La codificación no es válida.'),
    lineEnding: oneOf(output.lineEnding || 'CRLF', LINE_ENDINGS, 'El fin de línea no es válido.')
  };
  if (format === 'DELIMITED') {
    return { format, delimiter: oneOf(output.delimiter ?? ';', DELIMITERS, 'El separador no es válido.'), ...common };
  }
  return { format, ...common };
}

function normalizeSourceColumn(value, label) {
  return text(value, `la columna de origen de ${label}`, { required: true });
}

function normalizeSeparator(separator, label) {
  if (separator === undefined || separator === null) return ' ';
  if (typeof separator !== 'string' || separator.length > 5) fail(`${label}: el separador debe tener hasta 5 caracteres.`);
  return separator;
}

function finiteNumber(value, label) {
  const number = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) fail(`${label} debe ser un número.`);
  return number;
}

// A value used by a function: a file column, an earlier output column, a number or a text (when allowed).
function normalizeOperand(operand, label, { allowText = false, allowEmpty = false } = {}) {
  if (operand?.type === 'COLUMN') return { type: 'COLUMN', column: normalizeSourceColumn(operand.column, label) };
  if (operand?.type === 'OUTPUT') return { type: 'OUTPUT', columnId: text(operand.columnId, `la columna usada en ${label}`, { required: true, max: 64 }) };
  if (operand?.type === 'NUMBER') return { type: 'NUMBER', value: finiteNumber(operand.value, `Un número de ${label}`) };
  if (operand?.type === 'PARAM') return { type: 'PARAM', paramId: text(operand.paramId, `el parámetro usado en ${label}`, { required: true, max: 64 }) };
  if (allowText && operand?.type === 'TEXT') return { type: 'TEXT', value: typeof operand.value === 'string' ? operand.value.slice(0, 500) : String(operand.value ?? '') };
  if (allowEmpty && (!operand || operand.type === 'EMPTY')) return { type: 'EMPTY' };
  return fail(`${label}: cada operando debe ser una columna${allowText ? ', un texto' : ''} o un número.`);
}

function operandList(operands, label, { min, max = 10, ...options }) {
  if (!Array.isArray(operands) || operands.length < min || operands.length > max) {
    fail(min > 1 && Array.isArray(operands) && operands.length < min ? `${label}: la operación necesita al menos ${min} valores.` : `${label}: la cantidad de valores no es válida.`);
  }
  return operands.map((operand) => normalizeOperand(operand, label, options));
}

// Arithmetic without expressions: a whitelisted operation over columns, earlier output columns and numbers.
function normalizeCalc(source, label) {
  const op = oneOf(source.op, CALC_OPERATIONS, `${label}: la operación de cálculo no es válida.`);
  if (!Array.isArray(source.operands) || source.operands.length > 10) fail(`${label}: el cálculo debe tener entre 1 y 10 valores.`);
  if (op === 'PERCENT' && source.operands.length !== 1) fail(`${label}: el porcentaje se calcula sobre un solo valor.`);
  if (op === 'ABS' && source.operands.length !== 1) fail(`${label}: el valor absoluto se calcula sobre un solo valor.`);
  const operands = operandList(source.operands, label, { min: SINGLE_OPERAND_CALCS.includes(op) ? 1 : 2 });

  const round = source.round || {};
  const calc = {
    type: 'CALC',
    op,
    operands,
    round: {
      mode: oneOf(round.mode || 'ROUND', ROUND_MODES, `${label}: el redondeo no es válido.`),
      ...(round.mode === 'NONE' ? {} : { decimals: round.decimals === undefined ? 0 : integer(round.decimals, `${label}: los decimales`, { max: 6 }) })
    }
  };
  if (op === 'PERCENT') {
    if (source.value === undefined || source.value === null || source.value === '') fail(`${label}: falta el porcentaje.`);
    calc.value = finiteNumber(source.value, `El porcentaje de ${label}`);
  }
  return calc;
}

function normalizeCondition(condition, label) {
  const op = oneOf(condition?.op, CONDITION_OPERATORS, `${label}: el operador de la condición no es válido.`);
  const normalized = { left: normalizeOperand(condition.left, label, { allowText: true }), op };
  if (!['EMPTY', 'NOT_EMPTY'].includes(op)) normalized.right = normalizeOperand(condition.right, label, { allowText: true });
  return normalized;
}

function normalizeCase(source, label) {
  if (!Array.isArray(source.cases) || source.cases.length > 20) fail(`${label}: la condición debe tener hasta 20 casos.`);
  return {
    type: 'CASE',
    cases: source.cases.map((branch) => {
      if (!Array.isArray(branch?.conditions) || !branch.conditions.length || branch.conditions.length > 5) fail(`${label}: cada caso necesita entre 1 y 5 condiciones.`);
      return {
        match: oneOf(branch.match || 'ALL', ['ALL', 'ANY'], `${label}: el tipo de coincidencia no es válido.`),
        conditions: branch.conditions.map((condition) => normalizeCondition(condition, label)),
        result: normalizeOperand(branch.result, label, { allowText: true, allowEmpty: true })
      };
    }),
    otherwise: normalizeOperand(source.otherwise, label, { allowText: true, allowEmpty: true })
  };
}

function normalizeMap(source, label) {
  if (!Array.isArray(source.entries) || source.entries.length > MAX_MAP_ENTRIES) fail(`${label}: la tabla de equivalencias admite hasta ${MAX_MAP_ENTRIES} filas.`);
  const otherwise = source.otherwise || { mode: 'KEEP' };
  const mode = oneOf(otherwise.mode, ['KEEP', 'EMPTY', 'TEXT'], `${label}: la opción para valores sin equivalencia no es válida.`);
  return {
    type: 'MAP',
    input: normalizeOperand(source.input, label),
    entries: source.entries
      .map((entry) => ({ from: String(entry?.from ?? '').slice(0, 200), to: String(entry?.to ?? '').slice(0, 500) }))
      .filter((entry) => entry.from.trim() !== ''),
    otherwise: mode === 'TEXT' ? { mode, value: String(otherwise.value ?? '').slice(0, 500) } : { mode },
    ...(source.matchCase === true ? { matchCase: true } : {})
  };
}

function normalizeDateCalc(source, label) {
  if (!Object.hasOwn(DATE_OPERATIONS, source.op)) fail(`${label}: la operación de fecha no es válida.`);
  const count = DATE_OPERATIONS[source.op];
  const operands = Array.isArray(source.operands) ? source.operands : [];
  if (operands.length !== count) fail(`${label}: la operación de fecha necesita ${count} valores.`);
  return {
    type: 'DATE_CALC',
    op: source.op,
    operands: operands.map((operand) => normalizeOperand(operand, label, { allowText: true })),
    ...(source.op === 'DAYS_BETWEEN' && source.inclusive === true ? { inclusive: true } : {})
  };
}

function normalizeSource(source, label) {
  const type = source?.type;
  if (type === 'EMPTY') return { type };
  if (type === 'COLUMN') return { type, column: normalizeSourceColumn(source.column, label) };
  if (type === 'CONSTANT') return { type, value: text(source.value ?? '', `el valor fijo de ${label}`) };
  if (type === 'PARAM') return normalizeOperand(source, label);
  const delimiter = source.delimiter ? { delimiter: text(source.delimiter, `el separador de ${label}`, { max: 5 }) || undefined } : {};
  if (delimiter.delimiter === undefined) delete delimiter.delimiter;
  if (type === 'SPLIT_WORD') return { type, column: normalizeSourceColumn(source.column, label), index: integer(source.index, `La palabra de ${label}`), ...delimiter };
  if (type === 'SPLIT_WORD_RANGE') {
    const range = { type, column: normalizeSourceColumn(source.column, label), start: integer(source.start, `La palabra inicial de ${label}`), ...delimiter };
    if (source.end !== undefined && source.end !== null) range.end = integer(source.end, `La palabra final de ${label}`);
    return range;
  }
  if (type === 'CASE') return normalizeCase(source, label);
  if (type === 'MAP') return normalizeMap(source, label);
  if (type === 'COALESCE') return { type, operands: operandList(source.operands, label, { min: 2, allowText: true }) };
  if (type === 'TEMPLATE') {
    const value = typeof source.text === 'string' ? source.text.slice(0, 500) : '';
    if ((value.match(/\{[^{}]+\}/g) || []).length > 30) fail(`${label}: el texto admite hasta 30 variables.`);
    return { type, text: value };
  }
  if (type === 'DATE_CALC') return normalizeDateCalc(source, label);
  if (type === 'ROW_NUMBER') return { type, start: source.start === undefined ? 1 : integer(source.start, `El inicio del correlativo de ${label}`, { min: 0, max: 1000000000 }) };
  if (type === 'CALC') return normalizeCalc(source, label);
  if (type === 'CONCAT') {
    if (!Array.isArray(source.parts) || source.parts.length === 0 || source.parts.length > 10) fail(`${label}: unir requiere entre 1 y 10 partes.`);
    return {
      type,
      separator: normalizeSeparator(source.separator, label),
      parts: source.parts.map((part) => {
        if (part?.type === 'COLUMN') return { type: 'COLUMN', column: normalizeSourceColumn(part.column, label) };
        if (part?.type === 'CONSTANT') return { type: 'CONSTANT', value: text(part.value ?? '', `el valor fijo de ${label}`) };
        return fail(`${label}: cada parte debe ser una columna o un valor fijo.`);
      })
    };
  }
  return fail(`${label}: el tipo de origen no es válido.`);
}

function normalizeTransformation(transformation, label) {
  const type = transformation?.type;
  if (type === 'RUT_FORMAT') return { type, format: oneOf(transformation.format, RUT_FORMATS, `${label}: el formato de RUT no es válido.`) };
  if (type === 'TEXT') return { type, operation: oneOf(transformation.operation, TEXT_OPERATIONS, `${label}: la operación de texto no es válida.`) };
  if (type === 'DATE_FORMAT') {
    return {
      type,
      inputFormat: oneOf(transformation.inputFormat || 'AUTO', DATE_INPUT_FORMATS, `${label}: el formato de fecha de entrada no es válido.`),
      outputFormat: oneOf(transformation.outputFormat, DATE_OUTPUT_FORMATS, `${label}: el formato de fecha de salida no es válido.`)
    };
  }
  if (type === 'REPLACE') {
    if (typeof transformation.find !== 'string' || !transformation.find || transformation.find.length > 100) fail(`${label}: indica el texto a reemplazar (hasta 100 caracteres).`);
    return { type, find: transformation.find, replace: String(transformation.replace ?? '').slice(0, 100) };
  }
  if (type === 'PAD') {
    if (typeof transformation.char !== 'string' || [...transformation.char].length !== 1) fail(`${label}: el carácter de relleno debe ser uno solo.`);
    return {
      type,
      length: integer(transformation.length, `${label}: el largo del relleno`, { min: 1, max: 1000 }),
      char: transformation.char,
      side: oneOf(transformation.side || 'LEFT', ['LEFT', 'RIGHT'], `${label}: el lado del relleno no es válido.`)
    };
  }
  if (type === 'SUBSTRING') {
    const substring = { type, start: integer(transformation.start, `${label}: la posición inicial`, { min: 1, max: 10000 }) };
    if (transformation.length !== undefined && transformation.length !== null) substring.length = integer(transformation.length, `${label}: la cantidad de caracteres`, { min: 1, max: 10000 });
    return substring;
  }
  if (type === 'NUMBER') {
    const number = { type };
    if (transformation.integer === true) number.integer = true;
    if (transformation.absolute === true) number.absolute = true;
    if (transformation.round !== undefined && transformation.round !== null) number.round = integer(transformation.round, `${label}: el redondeo`, { max: 10 });
    if (transformation.fixedDecimals !== undefined && transformation.fixedDecimals !== null) number.fixedDecimals = integer(transformation.fixedDecimals, `${label}: los decimales`, { max: 10 });
    if (transformation.decimalSeparator !== undefined) number.decimalSeparator = oneOf(transformation.decimalSeparator, ['.', ','], `${label}: el separador decimal no es válido.`);
    if (transformation.inputDecimalSeparator !== undefined && transformation.inputDecimalSeparator !== 'AUTO') {
      number.inputDecimalSeparator = oneOf(transformation.inputDecimalSeparator, ['.', ','], `${label}: el separador decimal de entrada no es válido.`);
    }
    return number;
  }
  return fail(`${label}: la transformación no es válida.`);
}

function normalizeFixedWidth(fixedWidth, label) {
  if (!fixedWidth || fixedWidth.length === undefined) fail(`${label}: falta el largo para el formato de ancho fijo.`);
  return {
    length: integer(fixedWidth.length, `${label}: el largo`, { min: 1, max: MAX_WIDTH }),
    align: oneOf(fixedWidth.align || 'LEFT', ['LEFT', 'RIGHT'], `${label}: la alineación no es válida.`),
    padChar: oneOf(fixedWidth.padChar ?? ' ', [' ', '0'], `${label}: el relleno debe ser espacio o cero.`)
  };
}

// Output columns referenced by a source: OUTPUT operands anywhere, and {@Name} placeholders in texts.
function outputReferences(source) {
  const ids = [];
  const names = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'OUTPUT') ids.push(node.columnId);
    if (node.type === 'TEMPLATE') for (const match of node.text.matchAll(/\{@([^{}]+)\}/g)) names.push(match[1].trim());
    Object.values(node).forEach(visit);
  };
  visit(source);
  return { ids, names };
}

function columnIdList(value, columnIds, label, { min = 1, max = 10 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label}: elige entre ${min} y ${max} columnas.`);
  const unique = [...new Set(value)];
  if (unique.some((id) => !columnIds.has(id))) fail(`${label}: usa una columna que no existe en la plantilla.`);
  return unique;
}

// Steps over whole rows, applied in a fixed order: fill down (input), filter, remove duplicates, group, sort.
// Returns null when nothing is configured, so templates without row steps keep their stored shape.
function normalizeRowSteps(steps, columns) {
  if (!steps || typeof steps !== 'object') return null;
  const columnIds = new Set(columns.map((column) => column.id));
  const normalized = {};

  if (Array.isArray(steps.fillDown) && steps.fillDown.length) {
    if (steps.fillDown.length > 50) fail('Rellenar hacia abajo admite hasta 50 columnas.');
    normalized.fillDown = [...new Set(steps.fillDown.map((column) => normalizeSourceColumn(column, 'rellenar hacia abajo')))];
  }

  if (steps.filter && Array.isArray(steps.filter.conditions) && steps.filter.conditions.length) {
    const label = 'El filtro de filas';
    if (steps.filter.conditions.length > 10) fail(`${label} admite hasta 10 condiciones.`);
    normalized.filter = {
      mode: oneOf(steps.filter.mode || 'KEEP', ['KEEP', 'EXCLUDE'], `${label}: el modo no es válido.`),
      match: oneOf(steps.filter.match || 'ALL', ['ALL', 'ANY'], `${label}: el tipo de coincidencia no es válido.`),
      conditions: steps.filter.conditions.map((condition) => normalizeCondition(condition, label))
    };
    if (outputReferences(normalized.filter).ids.some((id) => !columnIds.has(id))) fail(`${label} usa una columna que no existe en la plantilla.`);
  }

  if (steps.dedupe && Array.isArray(steps.dedupe.columnIds) && steps.dedupe.columnIds.length) {
    normalized.dedupe = {
      columnIds: columnIdList(steps.dedupe.columnIds, columnIds, 'Quitar duplicados'),
      keep: oneOf(steps.dedupe.keep || 'FIRST', ['FIRST', 'LAST'], 'Quitar duplicados: la fila a conservar no es válida.')
    };
  }

  if (steps.group && Array.isArray(steps.group.columnIds) && steps.group.columnIds.length) {
    const by = columnIdList(steps.group.columnIds, columnIds, 'Agrupar');
    const aggregates = (Array.isArray(steps.group.aggregates) ? steps.group.aggregates : [])
      .filter((aggregate) => !by.includes(aggregate?.columnId))
      .map((aggregate) => {
        if (!columnIds.has(aggregate?.columnId)) fail('Agrupar: un resumen usa una columna que no existe en la plantilla.');
        return { columnId: aggregate.columnId, op: oneOf(aggregate.op, AGGREGATES, 'Agrupar: el resumen no es válido.') };
      });
    const seen = new Set();
    normalized.group = { columnIds: by, aggregates: aggregates.filter((aggregate) => !seen.has(aggregate.columnId) && seen.add(aggregate.columnId)) };
  }

  if (Array.isArray(steps.sort) && steps.sort.length) {
    if (steps.sort.length > 5) fail('Ordenar admite hasta 5 columnas.');
    const seen = new Set();
    normalized.sort = steps.sort
      .map((key) => {
        if (!columnIds.has(key?.columnId)) fail('Ordenar: usa una columna que no existe en la plantilla.');
        return { columnId: key.columnId, direction: oneOf(key.direction || 'ASC', SORT_DIRECTIONS, 'Ordenar: la dirección no es válida.') };
      })
      .filter((key) => !seen.has(key.columnId) && seen.add(key.columnId));
  }

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeParameters(parameters) {
  if (parameters === undefined || parameters === null) return [];
  if (!Array.isArray(parameters) || parameters.length > MAX_PARAMETERS) fail(`La plantilla admite hasta ${MAX_PARAMETERS} parámetros.`);
  const ids = new Set();
  const names = new Set();
  return parameters.map((parameter, index) => {
    const name = text(parameter?.name, `el nombre del parámetro ${index + 1}`, { required: true, max: 60 });
    if (/[{}|:]/.test(name)) fail(`El nombre del parámetro «${name}» no puede tener { } | :`);
    const id = text(parameter.id, `el identificador del parámetro «${name}»`, { required: true, max: 64 });
    if (ids.has(id) || names.has(name.toLowerCase())) fail(`El parámetro «${name}» está repetido.`);
    ids.add(id);
    names.add(name.toLowerCase());
    const normalized = {
      id,
      name,
      type: oneOf(parameter.type || 'TEXT', PARAMETER_TYPES, `El tipo del parámetro «${name}» no es válido.`),
      required: parameter.required === true,
      defaultValue: text(parameter.defaultValue === undefined || parameter.defaultValue === null ? '' : String(parameter.defaultValue), `el valor por defecto de «${name}»`)
    };
    try {
      parseParameterValue(normalized, normalized.defaultValue);
    } catch (error) {
      if (error instanceof ParameterError) fail(`El valor por defecto de ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`);
      throw error;
    }
    return normalized;
  });
}

function designLines(lines, label) {
  if (lines === undefined || lines === null) return [];
  if (!Array.isArray(lines) || lines.length > MAX_DESIGN_LINES) fail(`${label} admite hasta ${MAX_DESIGN_LINES} líneas.`);
  return lines.map((line) => text(String(line ?? ''), label, { max: 500 }));
}

// File name, lines above and below the table, totals row and splitting. Only what is set is stored.
function normalizeOutputDesign(output, raw = {}, columnIds) {
  const design = {};
  const fileName = text(raw.fileName, 'el nombre del archivo', { max: 150 });
  if (fileName) design.fileName = fileName;
  const headerLines = designLines(raw.headerLines, 'El encabezado del archivo');
  if (headerLines.some(Boolean)) design.headerLines = headerLines;
  const footerLines = designLines(raw.footerLines, 'El pie del archivo');
  if (footerLines.some(Boolean)) design.footerLines = footerLines;

  if (raw.totals && Array.isArray(raw.totals.columns) && raw.totals.columns.length) {
    const seen = new Set();
    design.totals = {
      label: text(raw.totals.label ?? 'TOTAL', 'la etiqueta de la fila de totales', { max: 60 }),
      columns: raw.totals.columns
        .map((total) => {
          if (!columnIds.has(total?.columnId)) fail('La fila de totales usa una columna que no existe en la plantilla.');
          return { columnId: total.columnId, op: oneOf(total.op || 'SUM', TOTAL_OPERATIONS, 'La operación de la fila de totales no es válida.') };
        })
        .filter((total) => !seen.has(total.columnId) && seen.add(total.columnId))
    };
  }

  if (raw.split?.columnId) {
    if (!columnIds.has(raw.split.columnId)) fail('Dividir el archivo usa una columna que no existe en la plantilla.');
    const mode = oneOf(raw.split.mode || 'FILES', SPLIT_MODES, 'El modo de división no es válido.');
    if (mode === 'SHEETS' && output.format !== 'XLSX') fail('Solo un Excel puede dividirse en hojas; para texto elige un archivo por valor.');
    design.split = { columnId: raw.split.columnId, mode };
  }
  return { ...output, ...design };
}

function validateTemplateConfig(config) {
  if (!config || typeof config !== 'object') fail('La plantilla no es válida.');
  const output = normalizeOutput(config.output);
  const columns = config.columns;
  if (!Array.isArray(columns) || columns.length === 0) fail('La plantilla debe tener al menos una columna.');
  if (columns.length > MAX_COLUMNS) fail(`La plantilla no puede tener más de ${MAX_COLUMNS} columnas.`);

  const ids = new Set();
  const names = new Set();
  // The array order is the column order the user sees; stored positions are recomputed from it.
  const normalizedColumns = columns.map((column, index) => {
    const outputName = text(column?.outputName, `el nombre de la columna ${index + 1}`, { required: true });
    const label = `«${outputName}»`;
    const id = text(column.id, `el identificador de ${label}`, { required: true, max: 64 });
    if (ids.has(id)) fail(`El identificador de ${label} está repetido.`);
    const nameKey = outputName.toLowerCase();
    if (names.has(nameKey)) fail(`El nombre de columna ${label} está repetido.`);
    ids.add(id);
    names.add(nameKey);

    const aliases = [...new Set((Array.isArray(column.aliases) ? column.aliases : []).map((alias) => text(alias, `un alias de ${label}`)).filter(Boolean))].slice(0, 20);
    const normalized = {
      id,
      position: index + 1,
      outputName,
      required: column.required === true,
      // Set when a user confirmed an ambiguous source (split by words, shared column) and saved the template.
      reviewed: column.reviewed === true,
      aliases,
      source: normalizeSource(column.source, label),
      transformations: (Array.isArray(column.transformations) ? column.transformations : []).slice(0, 20).map((transformation) => normalizeTransformation(transformation, label)),
      validations: (Array.isArray(column.validations) ? column.validations : []).map((validation) => ({ type: oneOf(validation?.type, VALIDATIONS, `${label}: la validación no es válida.`) }))
    };
    if (column.semanticType) normalized.semanticType = text(column.semanticType, `el tipo de ${label}`, { max: 40 });
    if (output.format === 'FIXED_WIDTH') normalized.fixedWidth = normalizeFixedWidth(column.fixedWidth, label);
    // How the value is written in an Excel cell (a real number, percent or date); kept only for Excel output.
    if (output.format === 'XLSX' && column.cellFormat) normalized.cellFormat = oneOf(column.cellFormat, CELL_FORMATS, `${label}: el formato de celda no es válido.`);
    return normalized;
  });

  // Functions may only use columns that come before them, so there are no cycles.
  normalizedColumns.forEach((column, index) => {
    const earlierIds = new Set(normalizedColumns.slice(0, index).map((other) => other.id));
    const earlierNames = new Set(normalizedColumns.slice(0, index).map((other) => other.outputName));
    const references = outputReferences(column.source);
    if (references.ids.some((id) => !earlierIds.has(id)) || references.names.some((name) => !earlierNames.has(name))) {
      fail(`«${column.outputName}» solo puede usar columnas anteriores a ella en el archivo.`);
    }
  });

  const inputSheet = text(config.input?.sheet, 'la hoja sugerida', { max: 100 });
  const rowSteps = normalizeRowSteps(config.rowSteps, normalizedColumns);
  const parameters = normalizeParameters(config.parameters);
  const designedOutput = normalizeOutputDesign(output, config.output || {}, new Set(normalizedColumns.map((column) => column.id)));

  // Every parameter used by a column, a filter or the output texts must be declared.
  const references = parameterReferences([normalizedColumns.map((column) => column.source), rowSteps, designedOutput]);
  const missingId = references.ids.find((id) => !parameters.some((parameter) => parameter.id === id));
  const missingName = references.names.find((name) => !parameters.some((parameter) => parameter.name === name));
  if (missingId || missingName) fail(`Se usa el parámetro «${missingName || missingId}», que no existe en la plantilla.`);

  return {
    name: text(config.name, 'el nombre de la plantilla', { required: true, max: 120 }),
    description: text(config.description, 'la descripción', { max: 500 }),
    destination: text(config.destination, 'el destino', { max: 80 }),
    process: text(config.process, 'el proceso', { max: 80 }),
    input: { headerRow: 1, ...(inputSheet ? { sheet: inputSheet } : {}) },
    output: designedOutput,
    columns: normalizedColumns,
    ...(rowSteps ? { rowSteps } : {}),
    ...(parameters.length ? { parameters } : {})
  };
}

// Stored versions may predate the current schema (e.g. the original seed); normalize them on read.
function normalizeStoredTemplate(template) {
  return validateTemplateConfig({
    name: template.name,
    description: template.description,
    destination: template.destination,
    process: template.process,
    input: template.input,
    output: template.output,
    columns: template.columns,
    rowSteps: template.rowSteps,
    parameters: template.parameters
  });
}

module.exports = {
  validateTemplateConfig,
  normalizeStoredTemplate,
  TemplateValidationError,
  OUTPUT_FORMATS,
  DELIMITERS,
  RUT_FORMATS,
  TEXT_OPERATIONS,
  VALIDATIONS,
  CALC_OPERATIONS,
  CONDITION_OPERATORS,
  DATE_OPERATIONS,
  AGGREGATES,
  TOTAL_OPERATIONS,
  CELL_FORMATS,
  outputReferences,
  MAX_COLUMNS
};
