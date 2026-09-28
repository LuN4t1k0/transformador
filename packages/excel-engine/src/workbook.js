const ExcelJS = require('exceljs');
const { analyzeColumn } = require('../../detectors/src');
const { openWorkbook, XlsxFormatError } = require('./xlsx-reader');

const HEADER_ROW = 1;

class WorkbookLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function columnLetter(count) {
  let letters = '';
  for (let n = count; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

// Only plain values leave the engine: formulas are never evaluated, only their cached result is used.
function normalizeCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value !== 'object') return value;
  if ('result' in value) return normalizeCellValue(value.result);
  if (Array.isArray(value.richText)) return normalizeCellValue(value.richText.map((part) => part.text).join(''));
  if ('text' in value) return normalizeCellValue(value.text);
  return null;
}

function buildHeaders(rawHeaders) {
  const seen = new Map();
  const warnings = [];
  let emptyCount = 0;
  let duplicateCount = 0;

  const headers = rawHeaders.map((raw, index) => {
    const value = normalizeCellValue(raw);
    let header = value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
    if (!header) {
      emptyCount += 1;
      header = `Columna ${columnLetter(index + 1)}`;
    }
    const count = (seen.get(header) || 0) + 1;
    seen.set(header, count);
    if (count > 1) {
      duplicateCount += 1;
      header = `${header} (${count})`;
    }
    return header;
  });

  if (emptyCount) warnings.push({ code: 'EMPTY_HEADERS', count: emptyCount, message: `${emptyCount} columna(s) sin encabezado` });
  if (duplicateCount) warnings.push({ code: 'DUPLICATE_HEADERS', count: duplicateCount, message: `${duplicateCount} encabezado(s) repetido(s)` });
  return { headers, warnings };
}

const HEADER_SCAN_ROWS = 20;

function limitError(error) {
  if (error instanceof WorkbookLimitError) return error;
  if (error instanceof XlsxFormatError) return new WorkbookLimitError(error.code, error.code === 'INVALID_WORKBOOK' ? 'El archivo no es un Excel .xlsx válido o está dañado.' : error.message);
  return new WorkbookLimitError('INVALID_WORKBOOK', 'El archivo no es un Excel .xlsx válido o está dañado.');
}

async function withWorkbook(filePath, limits, work) {
  let workbook;
  try {
    workbook = await openWorkbook(filePath, { maxUncompressedBytes: limits.maxUncompressedBytes });
  } catch (error) {
    throw limitError(error);
  }
  try {
    if (workbook.sheets.length > limits.maxSheets) {
      throw new WorkbookLimitError('TOO_MANY_SHEETS', `El archivo supera el máximo de ${limits.maxSheets} hojas.`);
    }
    return await work(workbook);
  } catch (error) {
    throw limitError(error);
  } finally {
    workbook.close();
  }
}

function nonEmptyCount(cells) {
  return cells.filter((cell) => normalizeCellValue(cell) !== null).length;
}

// The header row is the first "wide" row that is mostly text among the first rows of the sheet.
// Title rows above the table (one or two cells) and numeric data rows are skipped.
function detectHeaderRow(rows) {
  const candidates = rows.filter((row) => nonEmptyCount(row.cells) > 0);
  if (!candidates.length) return HEADER_ROW;
  const widest = Math.max(...candidates.map((row) => nonEmptyCount(row.cells)));
  const minimum = Math.max(widest > 1 ? 2 : 1, Math.ceil(widest * 0.6));
  for (const row of candidates) {
    const values = row.cells.map(normalizeCellValue).filter((value) => value !== null);
    const textShare = values.filter((value) => typeof value === 'string' && !/^-?[\d.,]+$/.test(value.trim())).length / values.length;
    if (values.length >= minimum && textShare >= 0.6) return row.number;
  }
  return candidates[0].number;
}

// Streams the rows of one sheet as { type: 'header' } followed by { type: 'row' } items, applying limits.
async function* iterateSheet(workbook, sheetName, limits, requestedHeaderRow) {
  const source = workbook.rows(sheetName);
  const buffered = [];
  let headerRow = requestedHeaderRow;

  if (!headerRow) {
    for await (const row of source) {
      buffered.push(row);
      if (buffered.length >= HEADER_SCAN_ROWS) break;
    }
    headerRow = detectHeaderRow(buffered);
  }

  let headerInfo = null;
  let dataRows = 0;

  function* handle(row) {
    if (row.cells.length > limits.maxColumns) {
      throw new WorkbookLimitError('TOO_MANY_COLUMNS', `La hoja «${sheetName}» supera el máximo de ${limits.maxColumns} columnas.`);
    }
    if (row.number < headerRow) return;
    if (row.number === headerRow) {
      headerInfo = buildHeaders(Array.from(row.cells));
      yield { type: 'header', headerRow, ...headerInfo };
      return;
    }
    if (!headerInfo) {
      headerInfo = buildHeaders([]);
      yield { type: 'header', headerRow, ...headerInfo };
    }
    const cells = Array.from(row.cells, normalizeCellValue);
    if (cells.every((cell) => cell === null)) return;
    dataRows += 1;
    if (dataRows > limits.maxRows) {
      throw new WorkbookLimitError('TOO_MANY_ROWS', `La hoja «${sheetName}» supera el máximo de ${limits.maxRows} filas.`);
    }
    yield { type: 'row', rowNumber: row.number, cells };
  }

  for (const row of buffered) yield* handle(row);
  // The detection pass may have stopped the stream early; continue from where it left off.
  const remaining = requestedHeaderRow ? source : workbook.rows(sheetName);
  const skipUntil = requestedHeaderRow ? 0 : (buffered.at(-1)?.number ?? 0);
  for await (const row of remaining) {
    if (row.number <= skipUntil) continue;
    yield* handle(row);
  }

  if (!headerInfo) yield { type: 'header', headerRow, ...buildHeaders([]) };
}

async function analyzeWorkbook(filePath, { limits, sampleRows = 200, headerRows = {} }) {
  return withWorkbook(filePath, limits, async (workbook) => {
    const sheets = [];

    for (const { name, state } of workbook.sheets) {
      let headers = [];
      let warnings = [];
      let headerRow = HEADER_ROW;
      let rowCount = 0;
      let lastRow = 0;
      let columnCount = 0;
      const samples = [];

      for await (const item of iterateSheet(workbook, name, limits, headerRows[name])) {
        if (item.type === 'header') {
          ({ headers, warnings, headerRow } = item);
          columnCount = headers.length;
          continue;
        }
        rowCount += 1;
        lastRow = item.rowNumber;
        columnCount = Math.max(columnCount, item.cells.length);
        if (samples.length < sampleRows) samples.push(item.cells);
      }

      // Data beyond the header row gets a synthetic header so it stays mappable.
      while (headers.length < columnCount) headers.push(`Columna ${columnLetter(headers.length + 1)}`);

      const columns = headers.map((header, index) => {
        const { physical, semantic } = analyzeColumn(header, samples.map((cells) => cells[index] ?? null));
        return { header, position: index + 1, physical, semantic };
      });

      if (state !== 'visible') warnings = [...warnings, { code: 'HIDDEN_SHEET', message: 'La hoja está oculta en el Excel' }];
      if (headerRow !== HEADER_ROW) warnings = [...warnings, { code: 'HEADER_NOT_FIRST_ROW', message: `Los encabezados están en la fila ${headerRow}` }];
      if (rowCount === 0) warnings = [...warnings, { code: 'EMPTY_SHEET', message: 'La hoja no tiene filas de datos' }];

      sheets.push({
        name,
        headerRow,
        range: columnCount ? `A${headerRow}:${columnLetter(columnCount)}${Math.max(lastRow, headerRow)}` : null,
        rowCount,
        columnCount,
        headers,
        columns,
        warnings
      });
    }

    return { sheets };
  });
}

async function* readSheetRows(filePath, sheetName, { limits, headerRow }) {
  let workbook;
  try {
    workbook = await openWorkbook(filePath, { maxUncompressedBytes: limits.maxUncompressedBytes });
  } catch (error) {
    throw limitError(error);
  }
  try {
    if (!workbook.sheets.some((sheet) => sheet.name === sheetName)) {
      throw new WorkbookLimitError('SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);
    }
    let headers = [];
    for await (const item of iterateSheet(workbook, sheetName, limits, headerRow)) {
      if (item.type === 'header') {
        headers = [...item.headers];
        continue;
      }
      while (headers.length < item.cells.length) headers.push(`Columna ${columnLetter(headers.length + 1)}`);
      yield {
        rowNumber: item.rowNumber,
        values: Object.fromEntries(headers.map((header, index) => [header, item.cells[index] ?? null]))
      };
    }
  } catch (error) {
    throw limitError(error);
  } finally {
    workbook.close();
  }
}

async function writeWorkbook(filePath, { sheetName, headers, rows }) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath, useStyles: false, useSharedStrings: false });
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers).commit();
  for await (const values of rows) sheet.addRow(values).commit();
  sheet.commit();
  await workbook.commit();
}

module.exports = {
  WorkbookLimitError,
  detectHeaderRow,
  analyzeWorkbook,
  readSheetRows,
  writeWorkbook,
  normalizeCellValue
};
