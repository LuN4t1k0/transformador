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

function transformRow(row, template) {
  const output = {};
  const issues = [];
  const columns = [...template.columns].sort((a, b) => a.position - b.position);

  for (const column of columns) {
    const sourceValue = resolveSource(row, column.source);
    let value = sourceValue;

    for (const transformation of column.transformations || []) {
      value = applyTransformation(value, transformation);
    }

    const validations = [...(column.required ? [{ type: 'REQUIRED' }] : []), ...(column.validations || [])];
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
  }

  return { output, issues };
}

module.exports = {
  resolveSource,
  applyTransformation,
  validateValue,
  transformRow
};
