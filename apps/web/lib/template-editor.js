import { parseNumber } from '@previley-transformer/transformations/src/number.js';
import { packFormats, isSensitiveColumn } from './packs.js';

// Pure helpers behind the template editor UI. The UI edits a simplified "format" model per column which is
// converted to/from the template's transformations and validations arrays.

export const DATE_INPUT_OPTIONS = [
  { value: 'AUTO', label: 'Detectar automáticamente' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-AAAA o DD/MM/AAAA' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' },
  { value: 'YYYYMMDD', label: 'AAAAMMDD' },
  { value: 'YYYYMM', label: 'AAAAMM (primer día del mes)' },
  { value: 'EXCEL_SERIAL', label: 'Número de fecha de Excel' }
];

export const DATE_OUTPUT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA (03/05/2024)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-AAAA (03-05-2024)' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD (2024-05-03)' },
  { value: 'YYYYMMDD', label: 'AAAAMMDD (20240503)' },
  { value: 'DDMMYYYY', label: 'DDMMAAAA (03052024)' },
  { value: 'YYYYMM', label: 'AAAAMM (202405)' },
  { value: 'MM/YYYY', label: 'MM/AAAA (05/2024)' }
];

const CORE_PRIMARY_TYPES = ['DATE_FORMAT', 'NUMBER'];

// Formats contributed by the enabled domain packs (e.g. RUT): { kind, label, transformation, option, validation }.
export function domainFormats() {
  return packFormats();
}

export function parseFormat(column) {
  const transformations = column.transformations || [];
  const formats = domainFormats();
  const primaryTypes = new Set([...CORE_PRIMARY_TYPES, ...formats.map((format) => format.transformation)]);
  const primary = transformations.find((transformation) => primaryTypes.has(transformation.type));
  const domain = formats.find((format) => format.transformation === primary?.type);
  const textOps = new Set(transformations.filter((transformation) => transformation.type === 'TEXT').map((transformation) => transformation.operation));
  const validations = new Set((column.validations || []).map((validation) => validation.type));

  return {
    kind: domain ? domain.kind : primary?.type === 'DATE_FORMAT' ? 'DATE' : primary?.type === 'NUMBER' ? 'NUMBER' : 'NONE',
    // Option and validation of a pack format (for RUT: how to write it and whether to check the verifier).
    domainOption: domain ? primary[domain.option.key] : null,
    domainValidate: domain?.validation ? validations.has(domain.validation.type) : false,
    dateInput: primary?.type === 'DATE_FORMAT' ? primary.inputFormat || 'AUTO' : 'AUTO',
    dateOutput: primary?.type === 'DATE_FORMAT' ? primary.outputFormat : 'DD/MM/YYYY',
    numberDecimals: primary?.type === 'NUMBER' ? (primary.integer ? 0 : primary.fixedDecimals ?? null) : 0,
    decimalSeparator: primary?.type === 'NUMBER' ? primary.decimalSeparator || '.' : '.',
    inputDecimalSeparator: primary?.type === 'NUMBER' ? primary.inputDecimalSeparator || 'AUTO' : 'AUTO',
    validateInteger: validations.has('INTEGER'),
    numberPercent: primary?.type === 'NUMBER' ? primary.percent === true : false,
    textCase: textOps.has('UPPERCASE') ? 'UPPERCASE' : textOps.has('LOWERCASE') ? 'LOWERCASE' : textOps.has('TITLE_CASE') ? 'TITLE_CASE' : 'NONE',
    removeAccents: textOps.has('REMOVE_ACCENTS'),
    normalizeSpaces: textOps.has('NORMALIZE_SPACES') || textOps.has('TRIM'),
    digitsOnly: textOps.has('DIGITS_ONLY'),
    replacements: transformations.filter((transformation) => transformation.type === 'REPLACE').map(({ find, replace }) => ({ find, replace })),
    substring: transformations.find((transformation) => transformation.type === 'SUBSTRING') || null,
    pad: transformations.find((transformation) => transformation.type === 'PAD') || null
  };
}

export function applyFormat(column, format) {
  const transformations = [];
  const validations = [];

  const domain = domainFormats().find((candidate) => candidate.kind === format.kind);
  if (domain) {
    transformations.push({ type: domain.transformation, [domain.option.key]: format.domainOption ?? domain.option.default });
    if (domain.validation && format.domainValidate) validations.push({ type: domain.validation.type });
  }
  if (format.kind === 'DATE') transformations.push({ type: 'DATE_FORMAT', inputFormat: format.dateInput, outputFormat: format.dateOutput });
  if (format.kind === 'NUMBER') {
    const number = { type: 'NUMBER' };
    if (format.numberPercent) number.percent = true;
    if (format.numberDecimals === 0) number.integer = true;
    else if (Number.isInteger(format.numberDecimals)) number.fixedDecimals = format.numberDecimals;
    if (format.decimalSeparator === ',') number.decimalSeparator = ',';
    if (format.inputDecimalSeparator && format.inputDecimalSeparator !== 'AUTO') number.inputDecimalSeparator = format.inputDecimalSeparator;
    transformations.push(number);
    if (format.validateInteger && format.numberDecimals === 0) validations.push({ type: 'INTEGER' });
  }

  if (format.normalizeSpaces) transformations.push({ type: 'TEXT', operation: 'NORMALIZE_SPACES' });
  if (format.removeAccents) transformations.push({ type: 'TEXT', operation: 'REMOVE_ACCENTS' });
  if (format.textCase !== 'NONE') transformations.push({ type: 'TEXT', operation: format.textCase });
  if (format.digitsOnly) transformations.push({ type: 'TEXT', operation: 'DIGITS_ONLY' });
  for (const replacement of format.replacements || []) {
    if (replacement.find) transformations.push({ type: 'REPLACE', find: replacement.find, replace: replacement.replace || '' });
  }
  if (format.substring) transformations.push({ type: 'SUBSTRING', start: format.substring.start, ...(format.substring.length ? { length: format.substring.length } : {}) });
  if (format.pad) transformations.push({ type: 'PAD', length: format.pad.length, char: format.pad.char, side: format.pad.side });

  return { ...column, transformations, validations };
}

function uniqueName(base, columns) {
  const names = new Set(columns.map((column) => column.outputName.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

function newId() {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createColumn(columns, fixedWidth) {
  return {
    id: newId(),
    outputName: uniqueName('Nueva columna', columns),
    required: false,
    aliases: [],
    source: { type: 'EMPTY' },
    transformations: [],
    validations: [],
    ...(fixedWidth ? { fixedWidth: { length: 10, align: 'LEFT', padChar: ' ' } } : {})
  };
}

// Splits a column into the parts a pack format offers (e.g. a RUT into its number and, right after it, the
// check digit): the column keeps the first part and a new column is inserted for each other part.
export function splitColumn(columns, index, domain) {
  const original = columns[index];
  const withOption = (column, option) => applyFormat(column, { ...parseFormat(column), kind: domain.kind, domainOption: option });
  const [first, ...rest] = domain.split.parts;
  const added = [];
  for (const part of rest) {
    const outputName = uniqueName(`${original.outputName}${part.suffix}`, [...columns, ...added]);
    added.push({ ...withOption(structuredClone(original), part.option), id: newId(), outputName, aliases: [], reviewed: false, ...(original.fixedWidth ? { fixedWidth: { ...original.fixedWidth, length: Math.max(1, part.option === 'DV' ? 1 : original.fixedWidth.length) } } : {}) });
  }
  return [...columns.slice(0, index), withOption(original, first.option), ...added, ...columns.slice(index + 1)];
}

// Replaces a column with three: paternal surname, maternal surname and given names of the same full name.
export function splitNameColumn(columns, index, source) {
  const original = columns[index];
  const parts = [['PATERNAL', 'APELLIDO PATERNO'], ['MATERNAL', 'APELLIDO MATERNO'], ['NAMES', 'NOMBRES']];
  const others = columns.filter((_, position) => position !== index);
  const created = [];
  parts.forEach(([part, name], position) => {
    const outputName = uniqueName(name, [...others, ...created]);
    created.push({ ...structuredClone(original), id: position === 0 ? original.id : newId(), outputName, aliases: position === 0 ? original.aliases || [] : [], reviewed: false, source: { type: 'NAME_PART', column: source.column, order: source.order, part } });
  });
  return [...columns.slice(0, index), ...created, ...columns.slice(index + 1)];
}

export function duplicateColumn(columns, index) {
  const original = columns[index];
  const copy = { ...structuredClone(original), id: newId(), outputName: uniqueName(`${original.outputName} copia`, columns), aliases: [], reviewed: false };
  return [...columns.slice(0, index + 1), copy, ...columns.slice(index + 1)];
}

export function moveColumn(columns, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Structural comparison ignoring positions and aliases (aliases are managed when saving).
export function hasTemplateChanges(base, draft) {
  if (!base) return true;
  const shape = (template) => JSON.stringify({
    output: template.output,
    rowSteps: template.rowSteps || null,
    parameters: template.parameters || null,
    columns: template.columns.map(({ position, aliases, reviewed, ...column }) => column)
  });
  return shape(base) !== shape(draft);
}

// Dates travel from the API as { $date }; the engine expects Date instances.
// The inverse of `reviveSampleRows`: dates tagged as { $date } so rows can travel back to the API.
export function encodeSampleRows(rows) {
  return rows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value instanceof Date ? { $date: value.toISOString() } : value]))
  }));
}

export function reviveSampleRows(rows) {
  return rows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value && typeof value === 'object' && value.$date ? new Date(value.$date) : value]))
  }));
}

// Shows a value as the file will: dates as DD/MM/AAAA and, for columns with the Excel percentage format,
// the stored fraction as a percentage (0.0069 → 0,69%).
export function formatCell(value, column = null) {
  if (value === null || value === undefined || value === '') return '';
  // Like the Excel writer, text that reads as a number is stored as one, so a fixed "0.69" also shows as 69%.
  const percent = column?.cellFormat === 'PERCENT' ? (typeof value === 'number' ? value : parseNumber(value)) : null;
  if (typeof percent === 'number') {
    return `${Number((percent * 100).toPrecision(12)).toLocaleString('es-CL', { maximumFractionDigits: 6 })}%`;
  }
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  return String(value);
}

// Columns whose values are masked in on-screen samples (decided by the domain packs, e.g. RUT).
export { isSensitiveColumn };

// Replaces the columns and drops row step references to columns that no longer exist,
// so deleting a column never leaves the template invalid.
export function withColumns(template, columns) {
  const ids = new Set(columns.map((column) => column.id));
  const output = pruneOutput(template.output, ids);
  const steps = template.rowSteps;
  if (!steps) return { ...template, output, columns };
  const keep = (list) => list.filter((id) => ids.has(id));
  const usesMissing = (condition) => [condition.left, condition.right].some((operand) => operand?.type === 'OUTPUT' && !ids.has(operand.columnId));
  const next = { ...steps };
  if (steps.filter) {
    const conditions = steps.filter.conditions.filter((condition) => !usesMissing(condition));
    if (conditions.length) next.filter = { ...steps.filter, conditions };
    else delete next.filter;
  }
  if (steps.dedupe) {
    if (keep(steps.dedupe.columnIds).length) next.dedupe = { ...steps.dedupe, columnIds: keep(steps.dedupe.columnIds) };
    else delete next.dedupe;
  }
  if (steps.group) {
    if (keep(steps.group.columnIds).length) next.group = { columnIds: keep(steps.group.columnIds), aggregates: steps.group.aggregates.filter((item) => ids.has(item.columnId)) };
    else delete next.group;
  }
  if (steps.sort) {
    const sort = steps.sort.filter((key) => ids.has(key.columnId));
    if (sort.length) next.sort = sort;
    else delete next.sort;
  }
  const { rowSteps, ...rest } = template;
  return Object.keys(next).length ? { ...rest, output, columns, rowSteps: next } : { ...rest, output, columns };
}

// The totals row and the split use column ids too.
function pruneOutput(output, ids) {
  if (!output) return output;
  const next = { ...output };
  if (output.totals) {
    const totals = output.totals.columns.filter((total) => ids.has(total.columnId));
    if (totals.length) next.totals = { ...output.totals, columns: totals };
    else delete next.totals;
  }
  if (output.split && !ids.has(output.split.columnId)) delete next.split;
  return next;
}
