const ExcelJS = require('exceljs');
const { analyzeColumn } = require('../../detectors/src');

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

function invalidWorkbook() {
  return new WorkbookLimitError('INVALID_WORKBOOK', 'El archivo no es un Excel .xlsx válido o está dañado.');
}

// Loads the workbook in memory. exceljs' streaming reader is not deterministic when sharedStrings.xml
// comes after the sheets inside the zip (headers intermittently resolve as empty), so it is not used for
// reading. Memory is bounded by the upload size limit and the worker concurrency.
async function loadWorksheets(filePath, limits) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch {
    throw invalidWorkbook();
  }
  if (workbook.worksheets.length > limits.maxSheets) {
    throw new WorkbookLimitError('TOO_MANY_SHEETS', `El archivo supera el máximo de ${limits.maxSheets} hojas.`);
  }
  return workbook.worksheets;
}

function* iterateSheet(worksheet, limits) {
  let headerInfo = null;
  let dataRows = 0;
  const rows = [];
  worksheet.eachRow((row) => rows.push(row));

  for (const row of rows) {
    const values = row.values.slice(1);
    if (values.length > limits.maxColumns) {
      throw new WorkbookLimitError('TOO_MANY_COLUMNS', `La hoja «${worksheet.name}» supera el máximo de ${limits.maxColumns} columnas.`);
    }
    if (!headerInfo) {
      const isHeaderRow = row.number === HEADER_ROW;
      headerInfo = buildHeaders(isHeaderRow ? values : []);
      yield { type: 'header', ...headerInfo };
      if (isHeaderRow) continue;
    }

    const cells = values.map(normalizeCellValue);
    if (cells.every((cell) => cell === null)) continue;
    dataRows += 1;
    if (dataRows > limits.maxRows) {
      throw new WorkbookLimitError('TOO_MANY_ROWS', `La hoja «${worksheet.name}» supera el máximo de ${limits.maxRows} filas.`);
    }
    yield { type: 'row', rowNumber: row.number, cells };
  }

  if (!headerInfo) yield { type: 'header', ...buildHeaders([]) };
}

async function analyzeWorkbook(filePath, { limits, sampleRows = 200 }) {
  const sheets = [];

  for (const worksheet of await loadWorksheets(filePath, limits)) {
    let headers = [];
    let warnings = [];
    let rowCount = 0;
    let lastRow = 0;
    let columnCount = 0;
    const samples = [];

    for (const item of iterateSheet(worksheet, limits)) {
      if (item.type === 'header') {
        ({ headers, warnings } = item);
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

    if (rowCount === 0) warnings = [...warnings, { code: 'EMPTY_SHEET', message: 'La hoja no tiene filas de datos' }];

    sheets.push({
      name: worksheet.name,
      range: columnCount ? `A1:${columnLetter(columnCount)}${Math.max(lastRow, HEADER_ROW)}` : null,
      rowCount,
      columnCount,
      headers,
      columns,
      warnings
    });
  }

  return { sheets };
}

async function* readSheetRows(filePath, sheetName, { limits }) {
  const worksheet = (await loadWorksheets(filePath, limits)).find((candidate) => candidate.name === sheetName);
  if (!worksheet) throw new WorkbookLimitError('SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);

  let headers = [];
  for (const item of iterateSheet(worksheet, limits)) {
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
  analyzeWorkbook,
  readSheetRows,
  writeWorkbook,
  normalizeCellValue
};
