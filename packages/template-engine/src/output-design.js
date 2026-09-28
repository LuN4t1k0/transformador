const { isBlank, toNumber, compare, displayText, CellIssue } = require('./engine');
const { formatAggregate } = require('./rows');
const { formatDate } = require('../../transformations/src/date');

// Running totals over written rows, per column, from values before formatting.
function createTotals(columns) {
  const stats = new Map(columns.map((column) => [column.id, { sum: 0, numbers: 0, present: 0, min: null, max: null }]));
  let rows = 0;
  return {
    add(row) {
      rows += 1;
      for (const column of columns) {
        const value = row.raw?.[column.outputName] ?? row.output[column.outputName];
        if (isBlank(value)) continue;
        const stat = stats.get(column.id);
        stat.present += 1;
        if (stat.min === null || compare(value, stat.min) < 0) stat.min = value;
        if (stat.max === null || compare(value, stat.max) > 0) stat.max = value;
        try {
          const number = toNumber(value);
          stat.sum += number;
          stat.numbers += 1;
        } catch (error) {
          if (!(error instanceof CellIssue)) throw error;
        }
      }
    },
    get rows() {
      return rows;
    },
    // A totals operation as { raw, output }: the output is formatted like the column when it is a number.
    compute(column, op) {
      const stat = stats.get(column.id);
      if (op === 'COUNT') return { raw: stat.present, output: stat.present };
      if (op === 'MIN' || op === 'MAX') {
        const raw = op === 'MIN' ? stat.min : stat.max;
        return { raw, output: raw === null ? null : formatAggregate(column, raw) };
      }
      if (!stat.numbers) return { raw: null, output: null };
      const raw = Math.round((op === 'AVERAGE' ? stat.sum / stat.numbers : stat.sum) * 1e9) / 1e9;
      return { raw, output: formatAggregate(column, raw) };
    },
    value(column, op) {
      return this.compute(column, op).output;
    }
  };
}

// The totals row as a row ({ output, raw }): the label in the first column without a total.
function totalsRow(output, columns, totals) {
  if (!output.totals) return null;
  const byColumn = new Map(output.totals.columns.map((total) => [total.columnId, total.op]));
  const labelColumn = columns.find((column) => !byColumn.has(column.id));
  const row = { output: {}, raw: {}, isTotals: true };
  for (const column of columns) {
    const value = byColumn.has(column.id)
      ? totals.compute(column, byColumn.get(column.id))
      : { raw: null, output: column === labelColumn ? output.totals.label || null : null };
    row.output[column.outputName] = value.output;
    row.raw[column.outputName] = value.raw;
  }
  return row;
}

function padValue(text, width, numeric) {
  if (!width) return text;
  return numeric ? text.padStart(width, '0') : text.padEnd(width, ' ');
}

// Replaces {variables} in file names and header/footer lines:
// {plantilla} {archivo} {hoja} {grupo} {filas} {fecha} {fecha:YYYYMMDD} {total:COLUMNA} {$Parámetro}, each with an optional |N width.
function renderDesignText(text, vars) {
  return String(text || '').replace(/\{([^{}|]+)(?:\|(\d{1,3}))?\}/g, (whole, rawName, rawWidth) => {
    const name = rawName.trim();
    const width = rawWidth ? Number(rawWidth) : 0;
    const [key, ...rest] = name.split(':');
    const argument = rest.join(':').trim();
    let value;
    if (name.startsWith('$')) value = vars.params?.byName.get(name.slice(1).trim());
    else if (key === 'plantilla') value = vars.templateName;
    else if (key === 'archivo') value = vars.inputName;
    else if (key === 'hoja') value = vars.sheet;
    else if (key === 'grupo') value = vars.group;
    else if (key === 'filas') value = vars.totals ? vars.totals.rows : undefined;
    else if (key === 'fecha') value = formatDate(vars.now || new Date(), { outputFormat: argument || 'DD-MM-YYYY' });
    else if (key === 'total') {
      const column = vars.columns?.find((candidate) => candidate.outputName.toLowerCase() === argument.toLowerCase());
      value = column && vars.totals ? vars.totals.value(column, 'SUM') : undefined;
    } else return whole;
    if (value === undefined) return whole;
    const shown = value instanceof Date ? formatDate(value, { outputFormat: 'DD-MM-YYYY' }) : displayText(value);
    return padValue(shown, width, typeof value === 'number' || /^-?\d+([.,]\d+)?$/.test(shown));
  });
}

// Whether the texts written before the rows need the rows first (row count or totals).
function needsTotalsFirst(output) {
  return (output.headerLines || []).some((line) => /\{\s*(filas|total:[^{}]+)(\|\d+)?\s*\}/.test(line));
}

// File names cannot carry path separators or characters Windows rejects.
function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'archivo';
}

// Name of the generated file (or of each part), without extension.
// With `vars.group` it names one part; a part name always carries the group, even if the pattern forgot it.
// An empty group ('') names the bundle of all parts.
function outputBaseName(template, vars) {
  const hasGroup = vars.group !== undefined && vars.group !== '';
  const pattern = template.output.fileName || (hasGroup ? '{archivo}-{plantilla}-{grupo}' : '{archivo}-{plantilla}');
  const rendered = renderDesignText(pattern, vars);
  const named = hasGroup && !/\{\s*grupo/.test(pattern) ? `${rendered}-${vars.group}` : rendered;
  // An empty {grupo} leaves doubled or dangling separators ("a--b", "a-"): tidy them.
  return safeFileName(safeFileName(named).replace(/([-_])\1+/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[-_\s]+|[-_\s]+$/g, ''));
}

function extensionOf(output, { part = false } = {}) {
  if (!part && output.split?.mode === 'FILES') return 'zip';
  return output.format === 'XLSX' ? 'xlsx' : output.extension || 'txt';
}

// What the design adds around the preview rows (the first part when the output is split): texts,
// totals row, file names and the parts that would be generated.
function previewDesign(template, results, vars = {}) {
  const { output } = template;
  const columns = [...template.columns].sort((a, b) => a.position - b.position);
  const rows = results.filter((row) => !row.issues?.some((issue) => issue.severity === 'error'));
  const base = { ...vars, templateName: template.name };
  const splitColumn = output.split ? columns.find((column) => column.id === output.split.columnId) : null;
  const groups = new Map();
  for (const row of rows) {
    const key = splitColumn ? displayText(row.output[splitColumn.outputName]).trim() || '(vacío)' : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const parts = [...groups.entries()].map(([name, partRows]) => ({
    name,
    rows: partRows.length,
    fileName: output.split?.mode === 'FILES' ? `${outputBaseName(template, { ...base, group: name })}.${extensionOf(output, { part: true })}` : null
  }));
  const first = parts[0];
  const totals = createTotals(columns);
  (groups.get(first?.name ?? null) || []).forEach((row) => totals.add(row));
  const context = { ...base, totals, columns, group: first?.name ?? undefined };
  return {
    fileName: `${outputBaseName(template, { ...base, group: splitColumn ? '' : undefined })}.${extensionOf(output)}`,
    parts: splitColumn ? parts : [],
    headerLines: (output.headerLines || []).map((line) => renderDesignText(line, context)),
    footerLines: (output.footerLines || []).map((line) => renderDesignText(line, context)),
    totalsRow: totalsRow(output, columns, totals)
  };
}

module.exports = { createTotals, totalsRow, renderDesignText, needsTotalsFirst, outputBaseName, safeFileName, previewDesign };
