const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const yauzl = require('yauzl');
const ExcelJS = require('exceljs');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { validateRunParameters, runtimeParameters } = require('../packages/template-engine/src/params');
const { previewRows } = require('../packages/template-engine/src/rows');
const { renderDesignText, createTotals, outputBaseName } = require('../packages/template-engine/src/output-design');
const { writeOutput, outputFileInfo } = require('../packages/excel-engine/src/output');
const { orderedColumns } = require('../packages/template-engine/src/run');

const col = (column) => ({ type: 'COLUMN', column });
const param = (paramId) => ({ type: 'PARAM', paramId });

const parameters = [
  { id: 'periodo', name: 'Periodo', type: 'TEXT', required: true },
  { id: 'tasa', name: 'Tasa', type: 'NUMBER', defaultValue: '10' },
  { id: 'corte', name: 'Fecha corte', type: 'DATE' }
];

function template(extra = {}, output = { format: 'XLSX' }) {
  return validateTemplateConfig({
    name: 'Ventas',
    output,
    parameters,
    columns: [
      { id: 'area', outputName: 'AREA', source: col('Area'), ...(output.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 6, align: 'LEFT', padChar: ' ' } } : {}) },
      { id: 'monto', outputName: 'MONTO', source: col('Monto'), transformations: [{ type: 'NUMBER', fixedDecimals: 2, decimalSeparator: ',' }], ...(output.format === 'XLSX' ? { cellFormat: 'NUMBER_2' } : {}), ...(output.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 10, align: 'RIGHT', padChar: ' ' } } : {}) },
      { id: 'periodo', outputName: 'PERIODO', source: param('periodo'), ...(output.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 8, align: 'LEFT', padChar: ' ' } } : {}) },
      { id: 'comision', outputName: 'COMISION', source: { type: 'CALC', op: 'PERCENT', value: 1, operands: [col('Monto')] }, ...(output.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 8, align: 'RIGHT', padChar: ' ' } } : {}) },
      { id: 'nota', outputName: 'NOTA', source: { type: 'TEMPLATE', text: '{Area} {$Periodo}' }, ...(output.format === 'FIXED_WIDTH' ? { fixedWidth: { length: 15, align: 'LEFT', padChar: ' ' } } : {}) }
    ].map((column) => ({ transformations: [], validations: [], ...column })),
    ...extra
  });
}

const input = [
  { Area: 'Norte', Monto: 1000 },
  { Area: 'Sur', Monto: 250.5 },
  { Area: 'Norte', Monto: 300 }
].map((values, index) => ({ rowNumber: index + 2, values }));

async function tempFile(name) {
  return path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'design-')), name);
}

async function* asRows(results) {
  for (const row of results) yield row;
}

test('parameters: declared, typed when running, used by columns, texts and filters', () => {
  assert.throws(() => template({ parameters: [] }), /parámetro «periodo»|parámetro «Periodo»/);
  assert.throws(() => template({ parameters: [{ id: 'x', name: 'X', type: 'NUMBER', defaultValue: 'abc' }] }), /número/);
  assert.throws(() => validateRunParameters(parameters, {}), /Falta el valor de «Periodo»/);
  assert.throws(() => validateRunParameters(parameters, { periodo: '202405', corte: 'ayer' }), /fecha/);
  const stored = validateRunParameters(parameters, { periodo: ' 202405 ', corte: '31-05-2024' });
  assert.deepEqual(stored, { periodo: '202405', tasa: 10, corte: '2024-05-31' });

  const params = runtimeParameters(parameters, stored);
  assert.equal(params.byName.get('Fecha corte').toISOString().slice(0, 10), '2024-05-31');
  const withFilter = template({ rowSteps: { filter: { mode: 'KEEP', conditions: [{ left: col('Area'), op: 'EQ', right: param('periodo') }] } } });
  assert.equal(previewRows(input, withFilter, new Date(), params).results.length, 0, 'filters can compare with a parameter');

  const { results } = previewRows(input, template(), new Date(), params);
  assert.deepEqual(results.map((row) => [row.output.PERIODO, row.output.NOTA]), [['202405', 'Norte 202405'], ['202405', 'Sur 202405'], ['202405', 'Norte 202405']]);
});

test('design texts: variables, dates, totals and fixed widths', () => {
  const tpl = template();
  const columns = orderedColumns(tpl);
  const totals = createTotals(columns);
  const { results } = previewRows(input, tpl);
  results.forEach((row) => totals.add(row));
  const vars = { templateName: 'Ventas', inputName: 'mayo', sheet: 'Hoja1', now: new Date(Date.UTC(2024, 5, 3, 12)), params: runtimeParameters(parameters, { periodo: '202405' }), totals, columns };
  assert.equal(renderDesignText('H{filas|6}{total:monto|12}{$Periodo}', vars), 'H000003000001550,50202405');
  assert.equal(renderDesignText('{plantilla} {archivo} {hoja} {fecha} {fecha:YYYYMMDD} {desconocida}', vars), 'Ventas mayo Hoja1 03-06-2024 20240603 {desconocida}');
  assert.equal(renderDesignText('{plantilla|10}|{$Periodo|8}', vars), 'Ventas    |00202405', 'texts pad with spaces, numbers with zeros');

  const named = template({}, { format: 'XLSX', fileName: 'Carga {$Periodo} {fecha:YYYYMMDD}' });
  assert.equal(outputBaseName(named, vars), 'Carga 202405 20240603');
  assert.equal(outputBaseName(template(), { ...vars, group: 'Norte' }), 'mayo-Ventas-Norte');
  assert.equal(outputBaseName({ output: { fileName: 'a/b:{grupo}' } }, { group: '' }), 'a-b');
});

test('delimited output with header record, totals row and footer', async () => {
  const output = { format: 'DELIMITED', delimiter: ';', includeHeaders: true, lineEnding: 'LF', headerLines: ['H;{filas};{total:MONTO}'], footerLines: ['FIN {$Periodo}'], totals: { label: 'TOTAL', columns: [{ columnId: 'monto', op: 'SUM' }, { columnId: 'comision', op: 'MAX' }] } };
  const tpl = template({}, output);
  const params = runtimeParameters(parameters, { periodo: '202405' });
  const filePath = await tempFile('out.csv');
  const written = await writeOutput(filePath, { template: tpl, columns: orderedColumns(tpl), rows: asRows(previewRows(input, tpl, new Date(), params).results), vars: { inputName: 'mayo', params } });
  assert.equal(await fs.readFile(filePath, 'utf8'), [
    'H;3;1550,50',
    'AREA;MONTO;PERIODO;COMISION;NOTA',
    'Norte;1000,00;202405;10;Norte 202405',
    'Sur;250,50;202405;3;Sur 202405',
    'Norte;300,00;202405;3;Norte 202405',
    'TOTAL;1550,50;;10;',
    'FIN 202405',
    ''
  ].join('\n'));
  assert.deepEqual(written, { fileName: 'mayo-Ventas.csv', parts: [{ name: null, rows: 3 }] });
});

test('excel output keeps numbers as numbers with the chosen cell format', async () => {
  const tpl = template({}, { format: 'XLSX', sheetName: 'DATOS', headerLines: ['Ventas {$Periodo}'], totals: { label: 'TOTAL', columns: [{ columnId: 'monto', op: 'SUM' }] } });
  const params = runtimeParameters(parameters, { periodo: '202405' });
  const filePath = await tempFile('out.xlsx');
  await writeOutput(filePath, { template: tpl, columns: orderedColumns(tpl), rows: asRows(previewRows(input, tpl, new Date(), params).results), vars: { params } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('DATOS');
  assert.equal(sheet.getRow(1).getCell(1).value, 'Ventas 202405');
  assert.deepEqual(sheet.getRow(2).values.slice(1), ['AREA', 'MONTO', 'PERIODO', 'COMISION', 'NOTA']);
  assert.equal(sheet.getRow(4).getCell(2).value, 250.5);
  assert.equal(sheet.getRow(4).getCell(2).numFmt, '#,##0.00');
  assert.deepEqual([sheet.getRow(6).getCell(1).value, sheet.getRow(6).getCell(2).value], ['TOTAL', 1550.5]);
  assert.equal(sheet.getRow(6).font?.bold, true);
});

test('split into sheets of one workbook', async () => {
  const tpl = template({}, { format: 'XLSX', split: { columnId: 'area', mode: 'SHEETS' }, totals: { label: 'TOTAL', columns: [{ columnId: 'monto', op: 'SUM' }] } });
  const params = runtimeParameters(parameters, { periodo: '202405' });
  const filePath = await tempFile('out.xlsx');
  const written = await writeOutput(filePath, { template: tpl, columns: orderedColumns(tpl), rows: asRows(previewRows(input, tpl, new Date(), params).results), vars: { inputName: 'mayo', params } });
  assert.deepEqual(written, { fileName: 'mayo-Ventas.xlsx', parts: [{ name: 'Norte', rows: 2 }, { name: 'Sur', rows: 1 }] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Norte', 'Sur']);
  assert.equal(workbook.getWorksheet('Norte').getRow(4).getCell(2).value, 1300, 'totals per part');
});

function readZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = {};
      zip.on('entry', (entry) => zip.openReadStream(entry, (streamError, stream) => {
        if (streamError) return reject(streamError);
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          files[entry.fileName] = Buffer.concat(chunks).toString('utf8');
          zip.readEntry();
        });
      }));
      zip.on('end', () => resolve(files));
      zip.readEntry();
    });
  });
}

test('split into files bundled in a zip, named with the group', async () => {
  const output = { format: 'DELIMITED', delimiter: ';', includeHeaders: true, lineEnding: 'LF', fileName: 'ventas_{grupo}_{$Periodo}', split: { columnId: 'area', mode: 'FILES' } };
  const tpl = template({}, output);
  assert.deepEqual(outputFileInfo(tpl.output), { extension: 'zip', contentType: 'application/zip' });
  assert.throws(() => template({}, { ...output, split: { columnId: 'area', mode: 'SHEETS' } }), /Solo un Excel/);
  const params = runtimeParameters(parameters, { periodo: '202405' });
  const filePath = await tempFile('out.zip');
  const written = await writeOutput(filePath, { template: tpl, columns: orderedColumns(tpl), rows: asRows(previewRows(input, tpl, new Date(), params).results), vars: { params } });
  assert.equal(written.fileName, 'ventas_202405.zip');
  assert.deepEqual(written.parts.map((part) => [part.name, part.rows, part.fileName]), [['Norte', 2, 'ventas_Norte_202405.csv'], ['Sur', 1, 'ventas_Sur_202405.csv']]);
  const files = await readZip(filePath);
  assert.deepEqual(Object.keys(files), ['ventas_Norte_202405.csv', 'ventas_Sur_202405.csv']);
  assert.equal(files['ventas_Sur_202405.csv'], 'AREA;MONTO;PERIODO;COMISION;NOTA\nSur;250,50;202405;3;Sur 202405\n');
  await assert.rejects(fs.stat(`${filePath}-partes`), 'temporary parts are removed');
});

test('fixed width totals that do not fit stop the file instead of being cut', async () => {
  const tpl = template({}, { format: 'FIXED_WIDTH', totals: { label: 'TOTAL', columns: [{ columnId: 'monto', op: 'SUM' }] } });
  const big = [{ rowNumber: 2, values: { Area: 'N', Monto: 9999999 } }, { rowNumber: 3, values: { Area: 'N', Monto: 9999999 } }];
  const params = runtimeParameters(parameters, { periodo: '202405' });
  await assert.rejects(
    writeOutput(await tempFile('out.txt'), { template: tpl, columns: orderedColumns(tpl), rows: asRows(previewRows(big, tpl, new Date(), params).results), vars: { params } }),
    /total de «MONTO» supera el largo/
  );
});
