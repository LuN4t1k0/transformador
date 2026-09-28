// Pure helpers behind the template editor UI. The UI edits a simplified "format" model per column which is
// converted to/from the template's transformations and validations arrays.

export const RUT_FORMAT_OPTIONS = [
  { value: 'NO_DOTS_NO_DASH', label: 'Sin puntos ni guion (123456785)' },
  { value: 'NO_DOTS_DASH', label: 'Con guion (12345678-5)' },
  { value: 'DOTS_DASH', label: 'Con puntos y guion (12.345.678-5)' },
  { value: 'BODY', label: 'Solo el número, sin dígito verificador (12345678)' },
  { value: 'DV', label: 'Solo el dígito verificador (5)' }
];

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

const PRIMARY_TYPES = new Set(['RUT_FORMAT', 'DATE_FORMAT', 'NUMBER']);

export function parseFormat(column) {
  const transformations = column.transformations || [];
  const primary = transformations.find((transformation) => PRIMARY_TYPES.has(transformation.type));
  const textOps = new Set(transformations.filter((transformation) => transformation.type === 'TEXT').map((transformation) => transformation.operation));
  const validations = new Set((column.validations || []).map((validation) => validation.type));

  return {
    kind: primary?.type === 'RUT_FORMAT' ? 'RUT' : primary?.type === 'DATE_FORMAT' ? 'DATE' : primary?.type === 'NUMBER' ? 'NUMBER' : 'NONE',
    rutFormat: primary?.type === 'RUT_FORMAT' ? primary.format : 'NO_DOTS_NO_DASH',
    validateRut: validations.has('VALID_RUT'),
    dateInput: primary?.type === 'DATE_FORMAT' ? primary.inputFormat || 'AUTO' : 'AUTO',
    dateOutput: primary?.type === 'DATE_FORMAT' ? primary.outputFormat : 'DD/MM/YYYY',
    numberDecimals: primary?.type === 'NUMBER' ? (primary.integer ? 0 : primary.fixedDecimals ?? null) : 0,
    decimalSeparator: primary?.type === 'NUMBER' ? primary.decimalSeparator || '.' : '.',
    inputDecimalSeparator: primary?.type === 'NUMBER' ? primary.inputDecimalSeparator || 'AUTO' : 'AUTO',
    validateInteger: validations.has('INTEGER'),
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

  if (format.kind === 'RUT') {
    transformations.push({ type: 'RUT_FORMAT', format: format.rutFormat });
    if (format.validateRut) validations.push({ type: 'VALID_RUT' });
  }
  if (format.kind === 'DATE') transformations.push({ type: 'DATE_FORMAT', inputFormat: format.dateInput, outputFormat: format.dateOutput });
  if (format.kind === 'NUMBER') {
    const number = { type: 'NUMBER' };
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
    columns: template.columns.map(({ position, aliases, reviewed, ...column }) => column)
  });
  return shape(base) !== shape(draft);
}

// Dates travel from the API as { $date }; the engine expects Date instances.
export function reviveSampleRows(rows) {
  return rows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value && typeof value === 'object' && value.$date ? new Date(value.$date) : value]))
  }));
}

export function formatCell(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  return String(value);
}

export function isRutColumn(column) {
  return column.semanticType === 'CHILEAN_RUT'
    || (column.transformations || []).some((transformation) => transformation.type === 'RUT_FORMAT')
    || (column.validations || []).some((validation) => validation.type === 'VALID_RUT');
}
