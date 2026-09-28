const fs = require('node:fs');
const { once } = require('node:events');
const { writeWorkbook } = require('./workbook');
const { formatFixedWidthValue } = require('../../template-engine/src/run');
const { displayText } = require('../../template-engine/src/engine');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function outputFileInfo(output) {
  if (output.format === 'XLSX') return { extension: 'xlsx', contentType: XLSX_TYPE };
  const charset = output.encoding === 'LATIN1' ? 'iso-8859-1' : 'utf-8';
  const type = output.extension === 'csv' ? 'text/csv' : 'text/plain';
  return { extension: output.extension, contentType: `${type}; charset=${charset}` };
}

function toText(value) {
  return displayText(value);
}

function escapeDelimited(value, delimiter) {
  const text = toText(value);
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
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

// Writes the final file for any output format. `rows` is an async iterable of value arrays ordered like `columns`.
async function writeOutput(filePath, { output, columns, rows }) {
  const headers = columns.map((column) => column.outputName);

  if (output.format === 'XLSX') {
    await writeWorkbook(filePath, { sheetName: output.sheetName || 'DATOS', headers, rows });
    return;
  }

  if (output.format === 'DELIMITED') {
    const line = (values) => values.map((value) => escapeDelimited(value, output.delimiter)).join(output.delimiter);
    await writeLines(filePath, output, (async function* lines() {
      if (output.includeHeaders) yield line(headers);
      for await (const values of rows) yield line(values);
    })());
    return;
  }

  if (output.format === 'FIXED_WIDTH') {
    const line = (values) => values.map((value, index) => formatFixedWidthValue(value, columns[index].fixedWidth)).join('');
    await writeLines(filePath, output, (async function* lines() {
      if (output.includeHeaders) yield line(headers);
      for await (const values of rows) yield line(values);
    })());
    return;
  }

  throw new Error(`Unsupported output format: ${output.format}`);
}

module.exports = { writeOutput, outputFileInfo };
