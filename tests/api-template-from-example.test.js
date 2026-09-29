const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const ExcelJS = require('exceljs');
const { LocalTemporaryStorage } = require('../packages/storage/src');
const { createTemplateService } = require('../apps/api/src/templates/service');
const { createJobService } = require('../apps/api/src/jobs/service');

const config = { maxFileSizeBytes: 5 * 1024 * 1024, maxRows: 1000, maxColumns: 100, maxSheets: 10, maxSampleRows: 50, maxUncompressedBytes: 50 * 1024 * 1024, tempFileTtlMs: 60 * 60 * 1000, hardTempFileTtlMs: 24 * 60 * 60 * 1000, maxActiveJobsPerUser: 3 };
const people = [
  ['12.345.678-5', 'PÉREZ SOTO JUAN CARLOS', 'Capital', 1000000, 50000],
  ['9.876.543-3', 'DE LA FUENTE ROJAS ANA', 'Modelo', 2500000, 0],
  ['10.231.091-8', 'SOTO DÍAZ PEDRO', 'Capital', 300000, 20000]
];

async function workbook(sheetName, headers, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

const originBuffer = () => workbook('Remuneraciones', ['RUT', 'Nombre completo', 'AFP', 'Sueldo', 'Bono'], people);
// The destination splits the RUT and the name, and adds a total the example alone cannot explain.
const destinationBuffer = () => workbook('Carga', ['RUT', 'DV', 'APELLIDO PATERNO', 'NOMBRES', 'TOTAL'], people.map(([rut, name, , salary, bonus]) => {
  const [body, dv] = rut.replace(/\./g, '').split('-');
  const paternal = name.startsWith('DE LA FUENTE') ? 'DE LA FUENTE' : name.split(' ')[0];
  const names = name.startsWith('DE LA FUENTE') ? 'ANA' : name.split(' ').slice(2).join(' ');
  return [body, dv, paternal, names, salary + bonus];
}));

// A multipart request like the browser sends, readable by the upload parser.
function multipartRequest(files) {
  const boundary = '----test-boundary';
  const parts = [];
  for (const [field, { name, buffer }] of Object.entries(files)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`), buffer, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const request = Readable.from([Buffer.concat(parts)]);
  request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  return request;
}

async function setup() {
  const storage = new LocalTemporaryStorage({ rootDir: await fs.mkdtemp(path.join(os.tmpdir(), 'from-example-')) });
  const { key, path: filePath } = await storage.reserve({ extension: 'xlsx' });
  await fs.writeFile(filePath, await originBuffer());
  return { storage, inputKey: key, templateService: createTemplateService({ templates: {}, storage, config }) };
}

test('learns a template from a destination example using a stored source file', async () => {
  const { storage, inputKey, templateService } = await setup();
  const before = await fs.readdir(storage.rootDir ?? path.dirname(storage.resolvePath(inputKey)));
  const draft = await templateService.draftFromStoredInput(
    { inputKey, fileName: 'remuneraciones.xlsx', sheet: 'Remuneraciones' },
    multipartRequest({ output: { name: 'carga-ejemplo.xlsx', buffer: await destinationBuffer() } })
  );

  const byName = Object.fromEntries(draft.template.columns.map((column) => [column.outputName, column]));
  assert.deepEqual(draft.template.columns.map((column) => column.outputName), ['RUT', 'DV', 'APELLIDO PATERNO', 'NOMBRES', 'TOTAL']);
  assert.deepEqual(byName.RUT.transformations, [{ type: 'RUT_FORMAT', format: 'BODY' }]);
  assert.deepEqual(byName.DV.transformations, [{ type: 'RUT_FORMAT', format: 'DV' }]);
  assert.equal(byName['APELLIDO PATERNO'].source.type, 'NAME_PART');
  assert.deepEqual(draft.report.unresolved, ['TOTAL'], 'what the example alone cannot explain is left for the assistant or the user');
  assert.equal(draft.report.alignment, 'POSITION');

  assert.deepEqual(draft.input.headers, ['RUT', 'Nombre completo', 'AFP', 'Sueldo', 'Bono']);
  assert.equal(draft.input.exampleRows.length, 3);
  assert.deepEqual(draft.output.headers, ['RUT', 'DV', 'APELLIDO PATERNO', 'NOMBRES', 'TOTAL']);
  assert.equal(draft.output.exampleRows[1].values.DV, '3');

  assert.equal(await storage.exists(inputKey), true, 'the conversion keeps its source file');
  const after = await fs.readdir(storage.rootDir ?? path.dirname(storage.resolvePath(inputKey)));
  assert.deepEqual(after.sort(), before.sort(), 'the uploaded example is deleted right after reading');
});

test('asks for the destination example when none is uploaded', async () => {
  const { inputKey, templateService } = await setup();
  await assert.rejects(
    templateService.draftFromStoredInput({ inputKey, fileName: 'x.xlsx', sheet: 'Remuneraciones' }, multipartRequest({})),
    { status: 400, code: 'FILE_REQUIRED' }
  );
});

test('a conversion takes the learned template as its working template, without a base template', async () => {
  const { storage, inputKey, templateService } = await setup();
  const baseJob = {
    id: '00000000-0000-0000-0000-000000000009',
    userId: 'u1',
    status: 'READY',
    fileName: 'remuneraciones.xlsx',
    inputStorageKey: inputKey,
    selectedSheet: 'Remuneraciones',
    templateId: 'old-template',
    templateVersionId: null,
    confirmedIds: ['old'],
    createdAt: new Date(),
    workbookAnalysis: { sheets: [{ name: 'Remuneraciones', headers: ['RUT', 'Nombre completo', 'AFP', 'Sueldo', 'Bono'], rowCount: 3 }] }
  };
  let current = { ...baseJob };
  const audited = [];
  const service = createJobService({
    jobs: {
      getForUser: async () => ({ ...current }),
      update: async (id, changes) => {
        current = { ...current, ...changes };
        return { ...current };
      }
    },
    templates: { getVersion: async () => null },
    templateService,
    storage,
    config,
    audit: { record: async (event) => audited.push(event) }
  });

  const result = await service.templateFromExample(baseJob.id, { id: 'u1' }, multipartRequest({ output: { name: 'carga.xlsx', buffer: await destinationBuffer() } }));
  assert.equal(current.templateId, null);
  assert.deepEqual(current.confirmedIds, []);
  assert.deepEqual(current.workingTemplate.columns.map((column) => column.outputName), ['RUT', 'DV', 'APELLIDO PATERNO', 'NOMBRES', 'TOTAL']);
  assert.deepEqual(result.report.unresolved, ['TOTAL']);
  assert.equal(result.output.exampleRows.length, 3);
  assert.equal(result.job.workingTemplate.columns.length, 5);
  assert.deepEqual(audited.map((event) => [event.eventType, event.metadata.fromExample]), [['TEMPLATE_APPLIED', true]]);

  // Only while the conversion can still be edited.
  current = { ...current, status: 'TRANSFORMING' };
  await assert.rejects(
    service.templateFromExample(baseJob.id, { id: 'u1' }, multipartRequest({ output: { name: 'carga.xlsx', buffer: await destinationBuffer() } })),
    { status: 409 }
  );
});
