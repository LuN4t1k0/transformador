const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { analyzeWorkbook, readSheetRows, writeWorkbook, WorkbookLimitError } = require('../packages/excel-engine/src');

const limits = { maxRows: 100, maxColumns: 50, maxSheets: 5 };

async function createFixture(dir) {
  const workbook = new ExcelJS.Workbook();
  const resumen = workbook.addWorksheet('RESUMEN');
  resumen.addRow(['RUT', 'Nombre completo', 'Remuneracion', 'Fecha Inicio', 'AFP', 'AFP', '']);
  resumen.addRow(['12.345.678-5', 'SOTO PEREZ JUAN', 850000, new Date(Date.UTC(2024, 4, 3)), 'PlanVital', 'x', 'extra']);
  resumen.addRow(['15.678.901-5', { richText: [{ text: 'MUÑOZ ' }, { text: 'ROJAS ANA' }] }, { formula: 'C2*2', result: 1700000 }, '13-05-2024', 'Capital', 'y', null]);
  workbook.addWorksheet('VACIA');

  const filePath = path.join(dir, 'fixture.xlsx');
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

test('analyzes sheets with dimensions, deduplicated headers, types and warnings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = await createFixture(dir);

  const { sheets } = await analyzeWorkbook(filePath, { limits, sampleRows: 10 });
  const [resumen, vacia] = sheets;

  assert.equal(resumen.name, 'RESUMEN');
  assert.equal(resumen.rowCount, 2);
  assert.equal(resumen.columnCount, 7);
  assert.equal(resumen.range, 'A1:G3');
  assert.deepEqual(resumen.headers, ['RUT', 'Nombre completo', 'Remuneracion', 'Fecha Inicio', 'AFP', 'AFP (2)', 'Columna G']);
  assert.equal(resumen.columns[0].semantic.type, 'CHILEAN_RUT');
  assert.equal(resumen.columns[2].physical.type, 'INTEGER');
  assert.deepEqual(resumen.warnings.map((warning) => warning.code).sort(), ['DUPLICATE_HEADERS', 'EMPTY_HEADERS']);
  assert.equal(JSON.stringify(sheets).includes('SOTO'), false, 'analysis must not contain row values');

  assert.equal(vacia.rowCount, 0);
  assert.deepEqual(vacia.warnings.map((warning) => warning.code), ['EMPTY_SHEET']);
});

test('reads rows keyed by header with normalized cell values', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = await createFixture(dir);
  const rows = [];

  for await (const row of readSheetRows(filePath, 'RESUMEN', { limits })) rows.push(row);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowNumber, 2);
  assert.ok(rows[0].values['Fecha Inicio'] instanceof Date);
  assert.equal(rows[1].values['Nombre completo'], 'MUÑOZ ROJAS ANA');
  assert.equal(rows[1].values.Remuneracion, 1700000);
  assert.equal(rows[1].values['AFP (2)'], 'y');
});

test('enforces row, column and sheet limits', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = await createFixture(dir);

  await assert.rejects(analyzeWorkbook(filePath, { limits: { ...limits, maxRows: 1 } }), (error) => error instanceof WorkbookLimitError && error.code === 'TOO_MANY_ROWS');
  await assert.rejects(analyzeWorkbook(filePath, { limits: { ...limits, maxColumns: 3 } }), { code: 'TOO_MANY_COLUMNS' });
  await assert.rejects(analyzeWorkbook(filePath, { limits: { ...limits, maxSheets: 1 } }), { code: 'TOO_MANY_SHEETS' });
});

test('rejects files that are not valid xlsx workbooks', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = path.join(dir, 'fake.xlsx');
  await fs.writeFile(filePath, 'not a zip');

  await assert.rejects(analyzeWorkbook(filePath, { limits }), { code: 'INVALID_WORKBOOK' });
});

test('writes an output workbook from streamed rows', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = path.join(dir, 'out.xlsx');

  async function* rows() {
    yield ['102310918', 'NEIRA', 7];
    yield ['123456785', 'SOTO', 5];
  }

  await writeWorkbook(filePath, { sheetName: 'DATOS', headers: ['RUT', 'APELLIDO', 'DIAS'], rows: rows() });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('DATOS');
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['RUT', 'APELLIDO', 'DIAS']);
  assert.deepEqual(sheet.getRow(3).values.slice(1), ['123456785', 'SOTO', 5]);
});

test('detects header rows below titles and lets the caller override them', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('REPORTE');
  sheet.addRow(['Reporte de licencias mayo 2024']);
  sheet.addRow([]);
  sheet.addRow(['Empresa:', 'Ejemplo SpA']);
  sheet.addRow(['RUT', 'Nombre', 'Monto', 'Fecha']);
  sheet.addRow(['12.345.678-5', 'SOTO', 1000, new Date(Date.UTC(2024, 4, 3))]);
  sheet.addRow(['9.876.543-3', 'DIAZ', 2000, new Date(Date.UTC(2024, 4, 4))]);
  const hidden = workbook.addWorksheet('OCULTA', { state: 'hidden' });
  hidden.addRow(['A', 'B']);
  hidden.addRow([1, 2]);
  const filePath = path.join(dir, 'titles.xlsx');
  await workbook.xlsx.writeFile(filePath);

  const { sheets } = await analyzeWorkbook(filePath, { limits });
  assert.equal(sheets[0].headerRow, 4);
  assert.deepEqual(sheets[0].headers, ['RUT', 'Nombre', 'Monto', 'Fecha']);
  assert.equal(sheets[0].rowCount, 2);
  assert.equal(sheets[0].range, 'A4:D6');
  assert.ok(sheets[0].warnings.some((warning) => warning.code === 'HEADER_NOT_FIRST_ROW'));
  assert.ok(sheets[1].warnings.some((warning) => warning.code === 'HIDDEN_SHEET'));

  const rows = [];
  for await (const row of readSheetRows(filePath, 'REPORTE', { limits, headerRow: 4 })) rows.push(row);
  assert.deepEqual(rows.map((row) => row.rowNumber), [5, 6]);
  assert.equal(rows[1].values.Nombre, 'DIAZ');

  const forced = await analyzeWorkbook(filePath, { limits, headerRows: { REPORTE: 1 } });
  assert.equal(forced.sheets[0].headerRow, 1);
  assert.equal(forced.sheets[0].headers[0], 'Reporte de licencias mayo 2024');
});

test('rejects workbooks that expand beyond the uncompressed size limit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const filePath = await createFixture(dir);
  await assert.rejects(analyzeWorkbook(filePath, { limits: { ...limits, maxUncompressedBytes: 1000 } }), { code: 'TOO_LARGE_UNCOMPRESSED' });
});

test('reads percent-formatted header cells as text and picks the sheet with a real table', async () => {
  const { pickTableSheet } = require('../packages/excel-engine/src');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'excel-engine-'));
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet('Capital');
  main.addRow(['NOMBRES : EMPRESA']);
  main.addRow([]);
  const header = main.addRow(['RUT', 'NOMBRE', 0.1, 'TOTAL']);
  header.getCell(3).numFmt = '0%';
  main.addRow(['12345678-5', 'SOTO', 7039, 8053]);
  main.addRow(['9876543-3', 'DIAZ', 8077, 9240]);
  const scratch = workbook.addWorksheet('Hoja6');
  for (let index = 0; index < 50; index += 1) scratch.addRow([17667962 + index, 'K']);
  const filePath = path.join(dir, 'destino.xlsx');
  await workbook.xlsx.writeFile(filePath);

  const { sheets } = await analyzeWorkbook(filePath, { limits });
  assert.deepEqual(sheets[0].headers, ['RUT', 'NOMBRE', '10%', 'TOTAL']);
  assert.equal(pickTableSheet(sheets).name, 'Capital');
});

test('headers repeated with different case get a unique name and keep their text as label', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dv-'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  sheet.addRow(['RUT EMPLEADOR', 'DV', 'RUT TRABAJADOR', 'Dv']);
  sheet.addRow(['76123456', '7', '12345678', '5']);
  const filePath = path.join(dir, 'dv.xlsx');
  await workbook.xlsx.writeFile(filePath);
  const { sheets } = await analyzeWorkbook(filePath, { limits });
  assert.deepEqual(sheets[0].headers, ['RUT EMPLEADOR', 'DV', 'RUT TRABAJADOR', 'Dv (2)']);
  assert.equal(sheets[0].columns[3].label, 'Dv');
  assert.equal(sheets[0].columns[1].label, undefined);
});
