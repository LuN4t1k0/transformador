const { NO_PARAMETERS, CellIssue, isBlank, normalizeText, toNumber, compare, conditionHolds, applyTransformation, displayText } = require('./engine');
const { orderedColumns, transformTemplateRow, checkFixedWidth } = require('./run');

const NUMERIC_AGGREGATES = ['SUM', 'AVERAGE'];

// Fills blank cells of the chosen input columns with the last value seen above them
// (typical of reports with merged cells or a value written only on the first row of a block).
function createFillDown(columns = []) {
  const last = {};
  return (values) => {
    if (!columns.length) return values;
    const filled = { ...values };
    for (const column of columns) {
      if (isBlank(filled[column])) {
        if (column in last) filled[column] = last[column];
      } else {
        last[column] = filled[column];
      }
    }
    return filled;
  };
}

function rowContext(columns, output, params) {
  const outputsById = new Map();
  const outputsByName = new Map();
  for (const column of columns) {
    outputsById.set(column.id, output[column.outputName]);
    outputsByName.set(column.outputName, output[column.outputName]);
  }
  return { outputsById, outputsByName, rowIndex: 0, now: new Date(), params };
}

function passesFilter(filter, values, columns, output, params) {
  if (!filter) return true;
  const context = rowContext(columns, output, params);
  const checks = filter.conditions.map((condition) => conditionHolds(values, condition, context));
  const matched = filter.match === 'ANY' ? checks.some(Boolean) : checks.every(Boolean);
  return filter.mode === 'EXCLUDE' ? !matched : matched;
}

function keyOf(names, output) {
  return JSON.stringify(names.map((name) => normalizeText(output[name])));
}

// Re-applies a column's format to an aggregated value (e.g. a sum keeps the column's decimals).
function formatAggregate(column, value) {
  let formatted = value;
  try {
    for (const transformation of column.transformations || []) formatted = applyTransformation(formatted, transformation);
  } catch {
    return value;
  }
  return isBlank(formatted) && !isBlank(value) ? value : formatted;
}

function createGroup(row) {
  return { rowNumber: row.rowNumber, rows: [row] };
}

function aggregate(op, column, rows) {
  const name = column.outputName;
  if (op === 'COUNT') return { raw: rows.length, output: rows.length };
  if (op === 'FIRST') return { raw: rows[0].raw[name], output: rows[0].output[name] };
  if (op === 'LAST') return { raw: rows.at(-1).raw[name], output: rows.at(-1).output[name] };
  if (op === 'CONCAT') {
    const texts = [...new Set(rows.map((row) => displayText(row.output[name]).trim()).filter(Boolean))];
    const joined = texts.length ? texts.join(', ') : null;
    return { raw: joined, output: joined };
  }
  const present = rows.filter((row) => !isBlank(row.raw[name]));
  if (op === 'MIN' || op === 'MAX') {
    if (!present.length) return { raw: null, output: null };
    const pick = present.reduce((best, row) => {
      const order = compare(row.raw[name], best.raw[name]);
      return (op === 'MIN' ? order < 0 : order > 0) ? row : best;
    });
    return { raw: pick.raw[name], output: pick.output[name] };
  }
  const numbers = present.map((row) => toNumber(row.raw[name]));
  if (!numbers.length) return { raw: null, output: null };
  const total = numbers.reduce((sum, number) => sum + number, 0);
  // Rounds away binary noise from sums like 0.1 + 0.2 without hiding real decimals.
  const value = Math.round((op === 'AVERAGE' ? total / numbers.length : total) * 1e9) / 1e9;
  return { raw: value, output: formatAggregate(column, value) };
}

function sortRows(rows, keys, columnsById) {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    for (const key of keys) {
      const name = columnsById.get(key.columnId).outputName;
      const left = a.row.raw[name] ?? a.row.output[name];
      const right = b.row.raw[name] ?? b.row.output[name];
      // Blank values always go last, whatever the direction.
      if (isBlank(left) || isBlank(right)) {
        if (isBlank(left) !== isBlank(right)) return isBlank(left) ? 1 : -1;
        continue;
      }
      const order = compare(left, right);
      if (order !== 0) return key.direction === 'DESC' ? -order : order;
    }
    return a.index - b.index;
  });
  return indexed.map(({ row }) => row);
}

// Applies the template's row steps around the per-row column evaluation. Rows go through `transform`
// (fill down, columns, filter); valid rows are handed to `accept`, which yields rows that can be written
// right away (no buffering steps) and `finish` yields the rest in their final order.
function createRowPipeline(template, { now = new Date(), params = NO_PARAMETERS } = {}) {
  const steps = template.rowSteps || {};
  const columns = orderedColumns(template);
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const names = (ids) => ids.map((id) => columnsById.get(id).outputName);
  const fillDown = createFillDown(steps.fillDown);
  const dedupeNames = steps.dedupe ? names(steps.dedupe.columnIds) : null;
  const groupNames = steps.group ? names(steps.group.columnIds) : null;
  const aggregateOf = new Map((steps.group?.aggregates || []).map((item) => [item.columnId, item.op]));
  const numericAggregates = columns.filter((column) => NUMERIC_AGGREGATES.includes(aggregateOf.get(column.id)));
  const rowNumberColumns = columns.filter((column) => column.source?.type === 'ROW_NUMBER');
  const buffers = Boolean(steps.group || steps.sort?.length || steps.dedupe?.keep === 'LAST');

  const seen = new Set();
  const lastByKey = new Map();
  const groups = new Map();
  const buffered = [];
  const stats = { excludedRows: 0, duplicateRows: 0, outputRows: 0 };

  function transform(rowNumber, values) {
    const filled = fillDown(values);
    // Correlatives count written rows; when rows are buffered they are renumbered in `finish`.
    const result = transformTemplateRow(filled, template, { rowIndex: stats.outputRows, now, params });
    if (!passesFilter(steps.filter, filled, columns, result.output, params)) {
      stats.excludedRows += 1;
      return { rowNumber, values: filled, excluded: true, output: result.output, raw: result.raw, issues: [] };
    }
    // Sums need numbers: a text in a summed column is a row problem, reported like any other.
    for (const column of numericAggregates) {
      const value = result.raw[column.outputName];
      if (isBlank(value)) continue;
      try {
        toNumber(value);
      } catch (error) {
        if (!(error instanceof CellIssue)) throw error;
        if (!result.issues.some((issue) => issue.column === column.outputName && issue.severity === 'error')) {
          result.issues.push({ column: column.outputName, rule: 'GROUP', severity: 'error', code: 'INVALID_NUMBER', message: error.message });
        }
      }
    }
    return { rowNumber, values: filled, excluded: false, output: result.output, raw: result.raw, issues: result.issues };
  }

  function* emit(row) {
    stats.outputRows += 1;
    yield row;
  }

  // Takes a valid row; yields it immediately when no later step needs the whole file.
  function* accept(row) {
    if (dedupeNames) {
      const key = keyOf(dedupeNames, row.output);
      if (steps.dedupe.keep === 'LAST') {
        if (lastByKey.has(key)) stats.duplicateRows += 1;
        lastByKey.delete(key);
        lastByKey.set(key, row);
        return;
      }
      if (seen.has(key)) {
        stats.duplicateRows += 1;
        return;
      }
      seen.add(key);
    }
    if (!buffers) {
      yield* emit(row);
      return;
    }
    buffered.push(row);
  }

  function groupRows(rows) {
    for (const row of rows) {
      const key = keyOf(groupNames, row.output);
      const group = groups.get(key);
      if (group) group.rows.push(row);
      else groups.set(key, createGroup(row));
    }
    return [...groups.values()].map((group) => {
      const output = {};
      const raw = {};
      for (const column of columns) {
        const op = steps.group.columnIds.includes(column.id) ? 'FIRST' : aggregateOf.get(column.id) || 'FIRST';
        const value = aggregate(op, column, group.rows);
        output[column.outputName] = value.output;
        raw[column.outputName] = value.raw;
      }
      return { rowNumber: group.rowNumber, rowNumbers: group.rows.map((row) => row.rowNumber), output, raw, issues: [] };
    });
  }

  function* finish() {
    if (!buffers) return;
    let rows = steps.dedupe?.keep === 'LAST' ? [...lastByKey.values()].sort((a, b) => a.rowNumber - b.rowNumber) : buffered;
    if (steps.group) rows = groupRows(rows);
    if (steps.sort?.length) rows = sortRows(rows, steps.sort, columnsById);
    // Correlatives follow the final order when rows were grouped or sorted.
    rows.forEach((row, index) => {
      for (const column of rowNumberColumns) {
        const value = (column.source.start ?? 1) + index;
        row.raw[column.outputName] = value;
        row.output[column.outputName] = formatAggregate(column, value);
      }
    });
    // Grouped totals can outgrow a fixed width column; those rows carry the issue so the caller can stop.
    if (steps.group && template.output?.format === 'FIXED_WIDTH') {
      for (const row of rows) row.issues = checkFixedWidth(columns, row.output);
    }
    for (const row of rows) yield* emit(row);
  }

  return { transform, accept, finish, stats: () => ({ ...stats }), columns, buffers };
}

// Runs a template over sample rows the way the worker does, for previews. Excluded rows are listed apart
// so the preview can explain them; rows with errors are kept (with their issues) to show what to fix.
function previewRows(rows, template, now = new Date(), params = NO_PARAMETERS) {
  const pipeline = createRowPipeline(template, { now, params });
  const results = [];
  const excluded = [];
  for (const { rowNumber, values } of rows) {
    const row = pipeline.transform(rowNumber, values);
    if (row.excluded) excluded.push(row);
    else if (row.issues.some((issue) => issue.severity === 'error')) results.push(row);
    else results.push(...pipeline.accept(row));
  }
  results.push(...pipeline.finish());
  return { results, excluded, stats: pipeline.stats() };
}

module.exports = { createRowPipeline, createFillDown, previewRows, formatAggregate };
