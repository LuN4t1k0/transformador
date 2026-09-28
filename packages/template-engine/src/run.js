const { transformRow } = require('./engine');

// The job mapping overrides the template's default sources; everything else comes from the template version.
function buildEffectiveTemplate(template, mapping) {
  return {
    ...template,
    columns: template.columns.map((column) => ({ ...column, source: mapping[column.id] || { type: 'EMPTY' } }))
  };
}

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

function runRows(rows, template, mapping) {
  const effectiveTemplate = buildEffectiveTemplate(template, mapping);
  return rows.map(({ rowNumber, values }) => ({ rowNumber, ...transformRow(values, effectiveTemplate) }));
}

module.exports = { buildEffectiveTemplate, orderedColumns, createSummaryAccumulator, runRows };
