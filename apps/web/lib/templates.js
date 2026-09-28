const RUT_FORMATS = {
  NO_DOTS_NO_DASH: 'RUT sin puntos ni guion',
  NO_DOTS_DASH: 'RUT con guion',
  DOTS_DASH: 'RUT con puntos y guion'
};

const TEXT_OPERATIONS = {
  TRIM: 'Quitar espacios',
  NORMALIZE_SPACES: 'Normalizar espacios',
  UPPERCASE: 'Mayúsculas',
  LOWERCASE: 'Minúsculas',
  REMOVE_ACCENTS: 'Sin tildes'
};

function describeTransformation(transformation) {
  if (transformation.type === 'RUT_FORMAT') return RUT_FORMATS[transformation.format] || 'Formato RUT';
  if (transformation.type === 'TEXT') return TEXT_OPERATIONS[transformation.operation] || 'Texto';
  if (transformation.type === 'DATE_FORMAT') return `Fecha ${transformation.inputFormat} → ${transformation.outputFormat}`;
  if (transformation.type === 'NUMBER') return transformation.integer ? 'Número entero' : 'Número';
  return transformation.type;
}

export function describeTransformations(column) {
  const labels = (column.transformations || []).map(describeTransformation);
  if ((column.validations || []).some((validation) => validation.type === 'VALID_RUT')) {
    labels.push('Valida dígito verificador');
  }
  return labels;
}

export function describeSource(entry) {
  if (entry.type === 'SPLIT_WORD') return `Palabra ${entry.index + 1} de «${entry.column}»`;
  if (entry.type === 'SPLIT_WORD_RANGE') return `Desde la palabra ${entry.start + 1} de «${entry.column}»`;
  if (entry.type === 'EMPTY') return 'Quedará vacía en el archivo final';
  return null;
}

const ISSUE_MESSAGES = {
  REQUIRED: 'Falta un valor requerido',
  INVALID_RUT: 'RUT con dígito verificador inválido',
  INVALID_INTEGER: 'Debe ser un número entero'
};

export function describeIssue(issue) {
  return ISSUE_MESSAGES[issue.code] || issue.message;
}
