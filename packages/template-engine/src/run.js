const { transformRow, displayText } = require('./engine');

function orderedColumns(template) {
  return [...template.columns].sort((a, b) => a.position - b.position);
}

// Accumulates validation results without keeping row values: issues are grouped by column and code,
// with exact counts over all rows and a few sample row numbers.
function createSummaryAccumulator({ maxGroups = 100, sampleRowsPerGroup = 10 } = {}) {
  const totals = { totalRows: 0, validRows: 0, errorCount: 0, warningCount: 0 };
  const groups = new Map();
  let truncatedGroups = false;

  return {
    add(rowNumber, issues) {
      totals.totalRows += 1;
      let hasError = false;
      for (const issue of issues) {
        if (issue.severity === 'error') {
          hasError = true;
          totals.errorCount += 1;
        } else {
          totals.warningCount += 1;
        }

        const key = `${issue.column}|${issue.code}`;
        let group = groups.get(key);
        if (!group) {
          if (groups.size >= maxGroups) {
            truncatedGroups = true;
            continue;
          }
          group = { column: issue.column, rule: issue.rule, severity: issue.severity, code: issue.code, count: 0, sampleRows: [] };
          groups.set(key, group);
        }
        group.count += 1;
        if (group.sampleRows.length < sampleRowsPerGroup) group.sampleRows.push(rowNumber);
      }
      if (!hasError) totals.validRows += 1;
      return !hasError;
    },
    result() {
      const issueGroups = [...groups.values()]
        .map((group) => ({ ...group, sampleRows: [...group.sampleRows] }))
        .sort((a, b) => b.count - a.count);
      return { ...totals, issueGroups, truncatedGroups };
    }
  };
}

function formatFixedWidthValue(value, { length, align = 'LEFT', padChar = ' ' }) {
  const text = displayText(value);
  if (text.length >= length) return text.slice(0, length);
  return align === 'RIGHT' ? text.padStart(length, padChar) : text.padEnd(length, padChar);
}

// Fixed width files must not silently lose data: values longer than the column are validation errors.
function checkFixedWidth(columns, output) {
  const issues = [];
  for (const column of columns) {
    if (!column.fixedWidth) continue;
    const value = output[column.outputName];
    const length = value === null || value === undefined ? 0 : String(value).length;
    if (length > column.fixedWidth.length) {
      issues.push({ column: column.outputName, rule: 'FIXED_WIDTH', severity: 'error', code: 'TOO_LONG', message: `Value exceeds ${column.fixedWidth.length} characters` });
    }
  }
  return issues;
}

// Runs the full template (sources, transformations, validations and output checks) on a row.
// `context` carries the row index (correlatives) and the processing date.
function transformTemplateRow(values, template, context) {
  const result = transformRow(values, template, context);
  if (template.output?.format === 'FIXED_WIDTH') result.issues.push(...checkFixedWidth(template.columns, result.output));
  return result;
}

function runRows(rows, template, now = new Date()) {
  return rows.map(({ rowNumber, values }, rowIndex) => ({ rowNumber, ...transformTemplateRow(values, template, { rowIndex, now }) }));
}

module.exports = { orderedColumns, createSummaryAccumulator, runRows, transformTemplateRow, checkFixedWidth, formatFixedWidthValue };
