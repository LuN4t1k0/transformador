import { DATE_OUTPUT_OPTIONS, RUT_FORMAT_OPTIONS } from './template-editor';

const TEXT_OPERATIONS = {
  TRIM: 'Quitar espacios',
  NORMALIZE_SPACES: 'Normalizar espacios',
  UPPERCASE: 'Mayúsculas',
  LOWERCASE: 'Minúsculas',
  REMOVE_ACCENTS: 'Sin tildes'
};

const OUTPUT_FORMATS = { XLSX: 'Excel (.xlsx)', DELIMITED: 'Texto delimitado', FIXED_WIDTH: 'Texto de ancho fijo' };

function shortLabel(options, value) {
  return (options.find((option) => option.value === value)?.label || value).replace(/\s*\(.*\)$/, '');
}

function describeTransformation(transformation) {
  if (transformation.type === 'RUT_FORMAT') return `RUT ${shortLabel(RUT_FORMAT_OPTIONS, transformation.format).toLowerCase()}`;
  if (transformation.type === 'TEXT') return TEXT_OPERATIONS[transformation.operation] || 'Texto';
  if (transformation.type === 'DATE_FORMAT') return `Fecha ${shortLabel(DATE_OUTPUT_OPTIONS, transformation.outputFormat)}`;
  if (transformation.type === 'NUMBER') {
    const decimals = transformation.integer ? 'Entero' : Number.isInteger(transformation.fixedDecimals) ? `${transformation.fixedDecimals} decimales` : 'Número';
    return transformation.decimalSeparator === ',' ? `${decimals} con coma` : decimals;
  }
  return transformation.type;
}

export function describeTransformations(column) {
  const labels = (column.transformations || []).map(describeTransformation);
  if ((column.validations || []).some((validation) => validation.type === 'VALID_RUT')) labels.push('Valida dígito verificador');
  return labels;
}

export function describeSource(source) {
  if (source.type === 'COLUMN') return `Columna «${source.column}»`;
  if (source.type === 'SPLIT_WORD') return `Palabra ${source.index + 1} de «${source.column}»`;
  if (source.type === 'SPLIT_WORD_RANGE') return `Desde la palabra ${source.start + 1} de «${source.column}»`;
  if (source.type === 'CONSTANT') return `Valor fijo «${source.value}»`;
  if (source.type === 'CONCAT') {
    return `Unir ${source.parts.map((part) => (part.type === 'COLUMN' ? `«${part.column}»` : `"${part.value}"`)).join(' + ')}`;
  }
  return 'Vacía';
}

export function describeOutput(output) {
  if (!output) return '';
  if (output.format === 'XLSX') return `${OUTPUT_FORMATS.XLSX}, hoja «${output.sheetName}»`;
  const delimiter = { ';': 'punto y coma', ',': 'coma', '|': 'barra |', '\t': 'tabulación' }[output.delimiter];
  const base = output.format === 'DELIMITED' ? `${OUTPUT_FORMATS.DELIMITED} (.${output.extension}, ${delimiter})` : `${OUTPUT_FORMATS.FIXED_WIDTH} (.${output.extension})`;
  return `${base}, ${output.encoding === 'LATIN1' ? 'Latin-1' : 'UTF-8'}`;
}

export function outputFormatLabel(format) {
  return OUTPUT_FORMATS[format] || format;
}

const ISSUE_MESSAGES = {
  REQUIRED: 'Falta un valor obligatorio',
  INVALID_RUT: 'RUT con dígito verificador inválido',
  INVALID_INTEGER: 'Debe ser un número entero',
  TOO_LONG: 'Supera el largo de la columna'
};

export function describeIssue(issue) {
  return ISSUE_MESSAGES[issue.code] || issue.message || issue.code;
}
