const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { writeOutput, outputFileInfo } = require('../packages/excel-engine/src/output');
const { checkFixedWidth, formatFixedWidthValue } = require('../packages/template-engine/src/run');

const columns = [
  { outputName: 'RUT', fixedWidth: { length: 9, align: 'RIGHT', padChar: '0' } },
  { outputName: 'NOMBRE', fixedWidth: { length: 10, align: 'LEFT', padChar: ' ' } },
  { outputName: 'MONTO', fixedWidth: { length: 6, align: 'RIGHT', padChar: ' ' } }
];

const asRow = ([RUT, NOMBRE, MONTO]) => ({ output: { RUT, NOMBRE, MONTO }, raw: { RUT, NOMBRE, MONTO } });

async function* rows() {
  yield asRow(['12345678', 'MUÑOZ; "A"', 1500]);
  yield asRow(['9876543', null, 20]);
}

async function tempFile(name) {
  return path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'output-')), name);
}

const template = (output) => ({ name: 'Prueba', output });

test('writes delimited text with escaping, encoding and line endings', async () => {
  const filePath = await tempFile('out.csv');
  await writeOutput(filePath, { template: template({ format: 'DELIMITED', delimiter: ';', includeHeaders: true, encoding: 'LATIN1', lineEnding: 'CRLF' }), columns, rows: rows() });

  const buffer = await fs.readFile(filePath);
  assert.equal(buffer.toString('latin1'), 'RUT;NOMBRE;MONTO\r\n12345678;"MUÑOZ; ""A""";1500\r\n9876543;;20\r\n');
  assert.equal(buffer.includes(Buffer.from('Ñ', 'utf8')), false, 'Ñ must be a single latin1 byte');
});

test('writes fixed width lines padded per column', async () => {
  const filePath = await tempFile('out.txt');
  async function* fixedRows() {
    yield asRow(['12345678', 'SOTO', 1500]);
  }
  await writeOutput(filePath, { template: template({ format: 'FIXED_WIDTH', includeHeaders: false, encoding: 'UTF-8', lineEnding: 'LF' }), columns, rows: fixedRows() });
  assert.equal(await fs.readFile(filePath, 'utf8'), '012345678SOTO        1500\n');
});

test('writes xlsx with headers', async () => {
  const filePath = await tempFile('out.xlsx');
  await writeOutput(filePath, { template: template({ format: 'XLSX', sheetName: 'DATOS' }), columns, rows: rows() });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assert.deepEqual(workbook.getWorksheet('DATOS').getRow(1).values.slice(1), ['RUT', 'NOMBRE', 'MONTO']);
});

test('reports fixed width overflow as an error instead of truncating', () => {
  assert.equal(formatFixedWidthValue('7', { length: 3, align: 'RIGHT', padChar: '0' }), '007');
  const issues = checkFixedWidth(columns, { RUT: '1234567890', NOMBRE: 'ANA', MONTO: 1 });
  assert.deepEqual(issues, [{ column: 'RUT', rule: 'FIXED_WIDTH', severity: 'error', code: 'TOO_LONG', message: 'Value exceeds 9 characters' }]);
});

test('describes file name, extension and content type per format', () => {
  assert.deepEqual(outputFileInfo({ format: 'XLSX' }), { extension: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.deepEqual(outputFileInfo({ format: 'DELIMITED', extension: 'txt', encoding: 'LATIN1' }), { extension: 'txt', contentType: 'text/plain; charset=iso-8859-1' });
  assert.deepEqual(outputFileInfo({ format: 'FIXED_WIDTH', extension: 'txt', encoding: 'UTF-8' }), { extension: 'txt', contentType: 'text/plain; charset=utf-8' });
});

test('builds an example input workbook with expected headers and instructions', async () => {
  const { buildExampleWorkbook } = require('../packages/excel-engine/src/example');
  const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
  const { planVitalPagexTemplate } = require('../packages/packs/chile/planvital-pagex');
  const buffer = await buildExampleWorkbook(validateTemplateConfig(planVitalPagexTemplate));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const data = workbook.getWorksheet('RESUMEN');
  const headers = data.getRow(1).values.slice(1);
  assert.deepEqual(headers.slice(0, 3), ['RUT', 'Nombre completo', 'Periodo']);
  assert.equal(headers.filter((header) => header === 'AFP').length, 1, 'shared origin columns appear once');
  assert.equal(data.getRow(2).getCell(1).value, '12.345.678-5');
  const help = workbook.getWorksheet('Instrucciones');
  assert.deepEqual(help.getRow(4).values.slice(1), ['Columna del Excel', 'Obligatoria', 'Qué debe contener', 'Se usa para']);
  assert.match(help.getRow(6).values.slice(1).join('|'), /Nombre completo\|Sí\|.*\|APELLIDO PATERNO, APELLIDO MATERNO, NOMBRE/);
});
