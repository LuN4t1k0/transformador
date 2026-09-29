const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { once } = require('node:events');
const ExcelJS = require('exceljs');
const { WorkbookLimitError } = require('./workbook');
const { writeZip } = require('./zip');
const { formatFixedWidthValue } = require('../../template-engine/src/run');
const { displayText, isBlank, toNumber } = require('../../template-engine/src/engine');
const { createTotals, totalsRow, renderDesignText, needsTotalsFirst, outputBaseName, safeFileName } = require('../../template-engine/src/output-design');
const { parseDate } = require('../../transformations/src/date');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_PARTS = 200;
const EMPTY_GROUP = '(vacío)';
const EXCEL_FORMATS = { NUMBER: '#,##0', NUMBER_2: '#,##0.00', PERCENT: '0.00%', DATE: 'dd/mm/yyyy' };

// Extension and content type of one generated file (a part, when the output is split into files).
function partFileInfo(output) {
  if (output.format === 'XLSX') return { extension: 'xlsx', contentType: XLSX_TYPE };
  const charset = output.encoding === 'LATIN1' ? 'iso-8859-1' : 'utf-8';
  const type = output.extension === 'csv' ? 'text/csv' : 'text/plain';
  return { extension: output.extension, contentType: `${type}; charset=${charset}` };
}

// What the user downloads: a ZIP when the output is split into several files.
function outputFileInfo(output) {
  if (output.split?.mode === 'FILES') return { extension: 'zip', contentType: 'application/zip' };
  return partFileInfo(output);
}

// Excel cells keep real numbers and dates when the column asks for it, so sums and filters work in Excel.
function excelValue(column, row) {
  const value = row.output[column.outputName];
  if (!column.cellFormat || isBlank(value)) return value ?? null;
  if (column.cellFormat === 'TEXT') return displayText(value);
  const raw = row.raw?.[column.outputName];
  if (column.cellFormat === 'DATE') return parseDate(isBlank(raw) ? value : raw, 'AUTO') || parseDate(value, 'AUTO') || value;
  for (const candidate of [raw, value]) {
    if (isBlank(candidate)) continue;
    try {
      return toNumber(candidate);
    } catch {
      // Not a number (e.g. the totals label): written as it is.
    }
  }
  return value;
}

function escapeDelimited(value, delimiter) {
  const text = displayText(value);
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function* toAsync(rows) {
  for await (const row of rows) yield row;
}

async function collect(rows) {
  const all = [];
  for await (const row of rows) all.push(row);
  return all;
}

// Rows with their running totals. A list is counted first, so lines above the table can show counts and totals.
function prepareRows(rows, columns) {
  const totals = createTotals(columns);
  if (Array.isArray(rows)) {
    rows.forEach((row) => totals.add(row));
    return { totals, rows: toAsync(rows), counted: true };
  }
  return { totals, rows, counted: false };
}

async function writeLines(filePath, output, lines) {
  const encoding = output.encoding === 'LATIN1' ? 'latin1' : 'utf8';
  const eol = output.lineEnding === 'LF' ? '\n' : '\r\n';
  const stream = fs.createWriteStream(filePath, { mode: 0o600 });
  try {
    for await (const line of lines) {
      if (!stream.write(Buffer.from(`${line}${eol}`, encoding))) await once(stream, 'drain');
    }
  } finally {
    stream.end();
    await once(stream, 'close');
  }
}

// The header row uses each column's own header text when it has one (a destination may repeat a header).
const headerText = (column) => column.header || column.outputName;

async function writeTextPart(filePath, { output, columns, rows, vars }) {
  const headers = columns.map(headerText);
  const valuesOf = (row) => columns.map((column) => row.output[column.outputName] ?? null);
  const line = output.format === 'FIXED_WIDTH'
    ? (values) => values.map((value, index) => formatFixedWidthValue(value, columns[index].fixedWidth)).join('')
    : (values) => values.map((value) => escapeDelimited(value, output.delimiter)).join(output.delimiter);
  const prepared = prepareRows(rows, columns);
  const context = { ...vars, totals: prepared.totals, columns };
  let count = 0;

  await writeLines(filePath, output, (async function* lines() {
    for (const text of output.headerLines || []) yield renderDesignText(text, context);
    if (output.includeHeaders) yield line(headers);
    for await (const row of prepared.rows) {
      if (!prepared.counted) prepared.totals.add(row);
      count += 1;
      yield line(valuesOf(row));
    }
    const totals = totalsRow(output, columns, prepared.totals);
    if (totals) {
      if (output.format === 'FIXED_WIDTH') {
        const tooLong = columns.find((column) => displayText(totals.output[column.outputName]).length > column.fixedWidth.length);
        if (tooLong) throw new WorkbookLimitError('TOTAL_TOO_LONG', `El total de «${tooLong.outputName}» supera el largo de la columna. Amplía el largo en la plantilla.`);
      }
      yield line(valuesOf(totals));
    }
    for (const text of output.footerLines || []) yield renderDesignText(text, context);
  })());
  return count;
}

function uniqueSheetName(name, used) {
  const base = (String(name).replace(/[\\/?*[\]:]/g, ' ').trim() || 'Hoja').slice(0, 31);
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// One workbook with one sheet per part. Each part: { sheetName, rows, vars }.
async function writeXlsxParts(filePath, { output, columns, parts }) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath, useStyles: true, useSharedStrings: false });
  const counts = [];
  for (const part of parts) {
    const sheet = workbook.addWorksheet(part.sheetName);
    sheet.columns = columns.map((column) => ({
      width: Math.min(40, Math.max(10, headerText(column).length + 2)),
      ...(EXCEL_FORMATS[column.cellFormat] ? { style: { numFmt: EXCEL_FORMATS[column.cellFormat] } } : {})
    }));
    const prepared = prepareRows(part.rows, columns);
    const context = { ...part.vars, totals: prepared.totals, columns };
    for (const text of output.headerLines || []) sheet.addRow([renderDesignText(text, context)]).commit();
    const header = sheet.addRow(columns.map(headerText));
    header.font = { bold: true };
    header.commit();
    let count = 0;
    for await (const row of prepared.rows) {
      if (!prepared.counted) prepared.totals.add(row);
      count += 1;
      sheet.addRow(columns.map((column) => excelValue(column, row))).commit();
    }
    const totals = totalsRow(output, columns, prepared.totals);
    if (totals) {
      const added = sheet.addRow(columns.map((column) => excelValue(column, totals)));
      added.font = { bold: true };
      added.commit();
    }
    for (const text of output.footerLines || []) sheet.addRow([renderDesignText(text, context)]).commit();
    sheet.commit();
    counts.push(count);
  }
  await workbook.commit();
  return counts;
}

function writePart(filePath, { output, columns, rows, vars, sheetName }) {
  if (output.format === 'XLSX') return writeXlsxParts(filePath, { output, columns, parts: [{ sheetName, rows, vars }] }).then(([count]) => count);
  if (output.format === 'DELIMITED' || output.format === 'FIXED_WIDTH') return writeTextPart(filePath, { output, columns, rows, vars });
  throw new Error(`Unsupported output format: ${output.format}`);
}

// Rows grouped by the split column, in order of first appearance.
function splitRows(rows, column) {
  const groups = new Map();
  for (const row of rows) {
    const key = displayText(row.output[column.outputName]).trim() || EMPTY_GROUP;
    if (!groups.has(key)) {
      if (groups.size >= MAX_PARTS) throw new WorkbookLimitError('TOO_MANY_PARTS', `Dividir por «${column.outputName}» generaría más de ${MAX_PARTS} partes. Elige otra columna.`);
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([name, groupRows]) => ({ name, rows: groupRows }));
}

// Writes the final file for any output format and design. `rows` is an async iterable of { output, raw }.
// `vars` feeds the texts ({archivo}, {hoja}, {fecha}, parameters…). Returns the download name and the parts.
async function writeOutput(filePath, { template, columns, rows, vars = {} }) {
  const { output } = template;
  const base = { ...vars, templateName: template.name };

  if (!output.split) {
    const source = needsTotalsFirst(output) ? await collect(rows) : rows;
    const count = await writePart(filePath, { output, columns, rows: source, vars: base, sheetName: output.sheetName || 'DATOS' });
    return { fileName: `${outputBaseName(template, base)}.${outputFileInfo(output).extension}`, parts: [{ name: null, rows: count }] };
  }

  const splitColumn = columns.find((column) => column.id === output.split.columnId);
  const groups = splitRows(await collect(rows), splitColumn);
  const zipName = `${outputBaseName(template, { ...base, group: '' })}.${outputFileInfo(output).extension}`;

  if (output.split.mode === 'SHEETS') {
    const used = new Set();
    const counts = await writeXlsxParts(filePath, {
      output,
      columns,
      parts: groups.map((group) => ({ sheetName: uniqueSheetName(group.name, used), rows: group.rows, vars: { ...base, group: group.name } }))
    });
    return { fileName: zipName, parts: groups.map((group, index) => ({ name: group.name, rows: counts[index] })) };
  }

  const directory = `${filePath}-partes`;
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const entries = [];
    const names = new Set();
    const parts = [];
    for (const [index, group] of groups.entries()) {
      const vars = { ...base, group: group.name };
      const partPath = `${directory}/${index}`;
      const count = await writePart(partPath, { output, columns, rows: group.rows, vars, sheetName: output.sheetName || 'DATOS' });
      let name = `${outputBaseName(template, vars)}.${partFileInfo(output).extension}`;
      for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `${outputBaseName(template, vars)} (${n}).${partFileInfo(output).extension}`;
      names.add(name.toLowerCase());
      entries.push({ name: safeFileName(name), path: partPath });
      parts.push({ name: group.name, rows: count, fileName: name });
    }
    await writeZip(filePath, entries, vars.now || new Date());
    return { fileName: zipName, parts };
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { writeOutput, outputFileInfo, partFileInfo, excelValue };
