import { transformRow } from '@previley-transformer/template-engine';

// Sheet row numbers start after the header row.
const FIRST_DATA_ROW = 2;

export function buildEffectiveTemplate(template, mapping) {
  return {
    ...template,
    columns: template.columns.map((column) => ({ ...column, source: mapping[column.id] || { type: 'EMPTY' } }))
  };
}

export function runTemplate(rows, template, mapping) {
  const effectiveTemplate = buildEffectiveTemplate(template, mapping);
  return rows.map((row, index) => ({
    rowNumber: FIRST_DATA_ROW + index,
    input: row,
    ...transformRow(row, effectiveTemplate)
  }));
}

export function summarizeResults(results) {
  const issues = results.flatMap((result) => result.issues.map((issue) => ({ row: result.rowNumber, ...issue })));
  const errors = issues.filter((issue) => issue.severity === 'error');
  const invalidRows = new Set(errors.map((issue) => issue.row));

  return {
    totalRows: results.length,
    validRows: results.length - invalidRows.size,
    errorCount: errors.length,
    warningCount: issues.length - errors.length,
    issues: issues.slice(0, 200)
  };
}

export function maskRut(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  const digitPositions = [...text].flatMap((char, index) => (/\d/.test(char) ? [index] : []));
  const lastIndex = text.length - 1;
  const visible = new Set([...digitPositions.slice(0, 2), lastIndex]);

  return [...text].map((char, index) => (/\d/.test(char) && !visible.has(index) ? '•' : char)).join('');
}
