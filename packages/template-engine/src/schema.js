const { DATE_INPUT_FORMATS, DATE_OUTPUT_FORMATS } = require('../../transformations/src/date');

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
const TEXT_OPERATIONS = ['TRIM', 'UPPERCASE', 'LOWERCASE', 'NORMALIZE_SPACES', 'REMOVE_ACCENTS'];
const VALIDATIONS = ['VALID_RUT', 'INTEGER'];

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

function normalizeSource(source, label) {
  const type = source?.type;
  if (type === 'EMPTY') return { type };
  if (type === 'COLUMN') return { type, column: normalizeSourceColumn(source.column, label) };
  if (type === 'CONSTANT') return { type, value: text(source.value ?? '', `el valor fijo de ${label}`) };
  if (type === 'SPLIT_WORD') return { type, column: normalizeSourceColumn(source.column, label), index: integer(source.index, `La palabra de ${label}`) };
  if (type === 'SPLIT_WORD_RANGE') {
    const range = { type, column: normalizeSourceColumn(source.column, label), start: integer(source.start, `La palabra inicial de ${label}`) };
    if (source.end !== undefined && source.end !== null) range.end = integer(source.end, `La palabra final de ${label}`);
    return range;
  }
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
  if (type === 'NUMBER') {
    const number = { type };
    if (transformation.integer === true) number.integer = true;
    if (transformation.absolute === true) number.absolute = true;
    if (transformation.round !== undefined && transformation.round !== null) number.round = integer(transformation.round, `${label}: el redondeo`, { max: 10 });
    if (transformation.fixedDecimals !== undefined && transformation.fixedDecimals !== null) number.fixedDecimals = integer(transformation.fixedDecimals, `${label}: los decimales`, { max: 10 });
    if (transformation.decimalSeparator !== undefined) number.decimalSeparator = oneOf(transformation.decimalSeparator, ['.', ','], `${label}: el separador decimal no es válido.`);
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
    return normalized;
  });

  const inputSheet = text(config.input?.sheet, 'la hoja sugerida', { max: 100 });
  return {
    name: text(config.name, 'el nombre de la plantilla', { required: true, max: 120 }),
    description: text(config.description, 'la descripción', { max: 500 }),
    destination: text(config.destination, 'el destino', { max: 80 }),
    process: text(config.process, 'el proceso', { max: 80 }),
    input: { headerRow: 1, ...(inputSheet ? { sheet: inputSheet } : {}) },
    output,
    columns: normalizedColumns
  };
}

module.exports = {
  validateTemplateConfig,
  TemplateValidationError,
  OUTPUT_FORMATS,
  DELIMITERS,
  RUT_FORMATS,
  TEXT_OPERATIONS,
  VALIDATIONS,
  MAX_COLUMNS
};
