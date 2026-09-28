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
