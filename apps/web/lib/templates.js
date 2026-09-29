import { DATE_OUTPUT_OPTIONS, RUT_FORMAT_OPTIONS } from './template-editor';

const TEXT_OPERATIONS = {
  TRIM: 'Quitar espacios',
  TITLE_CASE: 'Nombre Propio',
  DIGITS_ONLY: 'Solo dígitos',
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
  if (transformation.type === 'REPLACE') return `Reemplazar "${transformation.find}" por ${transformation.replace ? `"${transformation.replace}"` : 'nada'}`;
  if (transformation.type === 'PAD') return `Rellenar a ${transformation.length} con "${transformation.char}"`;
  if (transformation.type === 'SUBSTRING') return `Caracteres ${transformation.start}${transformation.length ? ` a ${transformation.start + transformation.length - 1}` : ' en adelante'}`;
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

const CALC_SYMBOLS = { SUM: ' + ', SUBTRACT: ' − ', MULTIPLY: ' × ', DIVIDE: ' ÷ ' };
const OPERATOR_SYMBOLS = { EQ: '=', NEQ: '≠', GT: '>', GTE: '≥', LT: '<', LTE: '≤', CONTAINS: 'contiene', STARTS_WITH: 'empieza con', ENDS_WITH: 'termina con', IN: 'es uno de', EMPTY: 'vacío', NOT_EMPTY: 'no vacío' };
const DATE_LABELS = { DAYS_BETWEEN: 'Días entre', ADD_DAYS: 'Sumar días a', ADD_MONTHS: 'Sumar meses a', YEAR: 'Año de', MONTH: 'Mes de', DAY: 'Día de', START_OF_MONTH: 'Inicio de mes de', END_OF_MONTH: 'Fin de mes de', TODAY: 'Fecha de proceso' };

function describeOperand(operand, outputNames) {
  if (!operand || operand.type === 'EMPTY') return 'vacío';
  if (operand.type === 'TEXT') return `"${operand.value}"`;
  if (operand.type === 'NUMBER') return String(operand.value).replace('.', ',');
  if (operand.type === 'OUTPUT') return `«${outputNames?.get(operand.columnId) || 'columna anterior'}»`;
  if (operand.type === 'PARAM') return `parámetro «${outputNames?.get(`param:${operand.paramId}`) || operand.paramId}»`;
  return `«${operand.column}»`;
}

// `outputNames` (Map id → name) resolves references to other columns of the template.
function describeCalc(source, outputNames) {
  const operands = source.operands.map((operand) => describeOperand(operand, outputNames));
  if (source.op === 'PERCENT') return `${String(source.value).replace('.', ',')}% de ${operands[0]}`;
  if (source.op === 'AVERAGE') return `Promedio de ${operands.join(', ')}`;
  if (source.op === 'MIN') return `Mínimo de ${operands.join(', ')}`;
  if (source.op === 'MAX') return `Máximo de ${operands.join(', ')}`;
  if (source.op === 'ABS') return `Valor absoluto de ${operands[0]}`;
  return `= ${operands.join(CALC_SYMBOLS[source.op])}`;
}

export function describeSource(source, outputNames) {
  if (source.type === 'COLUMN') return `Columna «${source.column}»`;
  if (source.type === 'SPLIT_WORD') return `${source.delimiter ? 'Parte' : 'Palabra'} ${source.index + 1} de «${source.column}»`;
  if (source.type === 'SPLIT_WORD_RANGE') return `Desde ${source.delimiter ? 'la parte' : 'la palabra'} ${source.start + 1} de «${source.column}»`;
  if (source.type === 'CONSTANT') return `Valor fijo «${source.value}»`;
  if (source.type === 'PARAM') return `Valor del ${describeOperand(source, outputNames)}`;
  if (source.type === 'CALC') return describeCalc(source, outputNames);
  if (source.type === 'CASE') {
    const first = source.cases[0];
    if (!first) return `Siempre ${describeOperand(source.otherwise, outputNames)}`;
    const condition = first.conditions[0];
    const right = ['EMPTY', 'NOT_EMPTY'].includes(condition.op) ? '' : ` ${describeOperand(condition.right, outputNames)}`;
    const more = source.cases.length > 1 || first.conditions.length > 1 ? ' …' : '';
    return `Si ${describeOperand(condition.left, outputNames)} ${OPERATOR_SYMBOLS[condition.op]}${right} → ${describeOperand(first.result, outputNames)}${more}`;
  }
  if (source.type === 'MAP') return `Equivalencias de ${describeOperand(source.input, outputNames)} (${source.entries.length})`;
  if (source.type === 'COALESCE') return `Primer valor de ${source.operands.map((operand) => describeOperand(operand, outputNames)).join(' o ')}`;
  if (source.type === 'TEMPLATE') return `Texto "${source.text}"`;
  if (source.type === 'DATE_CALC') return `${DATE_LABELS[source.op]}${source.operands.length ? ` ${source.operands.map((operand) => describeOperand(operand, outputNames)).join(' y ')}` : ''}`;
  if (source.type === 'ROW_NUMBER') return `Correlativo desde ${source.start ?? 1}`;
  if (source.type === 'CONCAT') {
    return `Unir ${source.parts.map((part) => (part.type === 'COLUMN' ? `«${part.column}»` : `"${part.value}"`)).join(' + ')}`;
  }
  return 'Vacía';
}

const AGGREGATE_LABELS = { SUM: 'suma', COUNT: 'cantidad', AVERAGE: 'promedio', MIN: 'mínimo', MAX: 'máximo', FIRST: 'primer valor', LAST: 'último valor', CONCAT: 'lista' };

function describeCondition(condition, outputNames) {
  const right = ['EMPTY', 'NOT_EMPTY'].includes(condition.op) ? '' : ` ${describeOperand(condition.right, outputNames)}`;
  return `${describeOperand(condition.left, outputNames)} ${OPERATOR_SYMBOLS[condition.op]}${right}`;
}

// One sentence per configured row step, in the order they are applied.
export function describeRowSteps(steps, columns) {
  if (!steps) return [];
  const outputNames = new Map(columns.map((column) => [column.id, column.outputName]));
  const names = (ids) => ids.map((id) => `«${outputNames.get(id) || id}»`).join(', ');
  const lines = [];
  if (steps.fillDown?.length) lines.push(`Rellenar hacia abajo ${steps.fillDown.map((name) => `«${name}»`).join(', ')}`);
  if (steps.filter) {
    const joiner = steps.filter.match === 'ANY' ? ' o ' : ' y ';
    lines.push(`${steps.filter.mode === 'KEEP' ? 'Mantener solo filas con' : 'Quitar filas con'} ${steps.filter.conditions.map((condition) => describeCondition(condition, outputNames)).join(joiner)}`);
  }
  if (steps.dedupe) lines.push(`Quitar duplicados por ${names(steps.dedupe.columnIds)} (conserva la ${steps.dedupe.keep === 'LAST' ? 'última' : 'primera'})`);
  if (steps.group) {
    const summaries = steps.group.aggregates.map((item) => `${AGGREGATE_LABELS[item.op]} de «${outputNames.get(item.columnId) || item.columnId}»`);
    lines.push(`Agrupar por ${names(steps.group.columnIds)}${summaries.length ? `: ${summaries.join(', ')}` : ''}`);
  }
  if (steps.sort?.length) lines.push(`Ordenar por ${steps.sort.map((key) => `«${outputNames.get(key.columnId) || key.columnId}» ${key.direction === 'DESC' ? '↓' : '↑'}`).join(', ')}`);
  return lines;
}

const TOTAL_LABELS = { SUM: 'suma', COUNT: 'cantidad', AVERAGE: 'promedio', MIN: 'mínimo', MAX: 'máximo' };
const CELL_FORMAT_LABELS = { NUMBER: 'número', NUMBER_2: 'número con 2 decimales', PERCENT: 'porcentaje', DATE: 'fecha', TEXT: 'texto' };
const PARAMETER_TYPE_LABELS = { TEXT: 'texto', NUMBER: 'número', DATE: 'fecha' };

export function describeParameter(parameter) {
  const details = [PARAMETER_TYPE_LABELS[parameter.type], parameter.required ? 'obligatorio' : null, parameter.defaultValue ? `por defecto ${parameter.defaultValue}` : null].filter(Boolean);
  return `${parameter.name} (${details.join(', ')})`;
}

// One sentence per design option of the output, for the template detail.
export function describeOutputDesign(output, columns) {
  const names = new Map(columns.map((column) => [column.id, column.outputName]));
  const lines = [];
  if (output.fileName) lines.push(`Nombre del archivo: ${output.fileName}`);
  if (output.headerLines?.length) lines.push(`Encabezado: ${output.headerLines.join(' / ')}`);
  if (output.totals) lines.push(`Fila «${output.totals.label}» con ${output.totals.columns.map((total) => `${TOTAL_LABELS[total.op]} de «${names.get(total.columnId)}»`).join(', ')}`);
  if (output.footerLines?.length) lines.push(`Pie: ${output.footerLines.join(' / ')}`);
  if (output.split) lines.push(`${output.split.mode === 'SHEETS' ? 'Una hoja' : 'Un archivo (en un .zip)'} por cada valor de «${names.get(output.split.columnId)}»`);
  const formatted = columns.filter((column) => column.cellFormat);
  if (formatted.length) lines.push(`Celdas de Excel: ${formatted.map((column) => `«${column.outputName}» como ${CELL_FORMAT_LABELS[column.cellFormat]}`).join(', ')}`);
  return lines;
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

export { describeIssue, describeIssueHint } from '@previley-transformer/template-engine/src/issues.js';
