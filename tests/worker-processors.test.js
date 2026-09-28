const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { LocalTemporaryStorage } = require('../packages/storage/src');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { createProcessors } = require('../apps/worker/src/processors');

const limits = { maxRows: 1000, maxColumns: 100, maxSheets: 10, maxSampleRows: 50 };
const headers = ['RUT', 'Nombre completo', 'Remuneracion', 'Periodo', 'Fecha Inicio', 'Fecha Término', 'AFP', 'dias_licencia', 'dias_pagados', 'base_utilizada', 'monto_rem_dias', 'aporte_pension', 'total_aporte_afp'];

function fictionalRow(rut, name) {
  return [rut, name, 850000, '202405', '03-05-2024', new Date(Date.UTC(2024, 4, 9)), 'PlanVital', 7, 23, 850000, 198333, 19833, 19833];
}

async function createInput(storage) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('RESUMEN');
  sheet.addRow(headers);
  sheet.addRow(fictionalRow('12.345.678-5', 'SOTO PEREZ JUAN'));
  sheet.addRow(fictionalRow('17.654.321-0', 'FUENTES VERA CAMILA'));
  sheet.addRow(fictionalRow('9.876.543-3', 'GONZALEZ DIAZ PEDRO'));
  workbook.addWorksheet('OTRA').addRow(['x']);
  const { key, path: filePath } = await storage.reserve({ extension: 'xlsx' });
  await workbook.xlsx.writeFile(filePath);
  return key;
}

function createFakeJobs(initial) {
  const jobs = new Map(initial.map((job) => [job.id, { confirmedIds: [], mode: 'LENIENT', ...job }]));
  return {
    jobs,
    async get(id) {
      return jobs.has(id) ? { ...jobs.get(id) } : null;
    },
    async update(id, changes, { expectStatus } = {}) {
      const job = jobs.get(id);
      if (!job || (expectStatus && ![].concat(expectStatus).includes(job.status))) return null;
      Object.assign(job, changes);
      return { ...job };
    },
    async findExpired(now) {
      return [...jobs.values()].filter((job) => job.expiresAt < now && !['PURGED', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(job.status));
    }
  };
}

async function setup(jobOverrides = {}, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-'));
  const storage = new LocalTemporaryStorage({ rootDir: dir });
  const inputStorageKey = await (options.createInput || createInput)(storage);
  const jobs = createFakeJobs([{ id: 'job-1', status: 'QUEUED_ANALYSIS', templateVersionId: 'v1', inputStorageKey, expiresAt: new Date(Date.now() + 60000), ...jobOverrides }]);
  const events = [];
  const processors = createProcessors({
    jobs,
    templates: { getVersion: async () => ({ id: 't1', ...planVitalPagexTemplate }) },
    storage,
    publish: async (jobId, type) => events.push(type),
    isCancelled: options.isCancelled || (async () => false),
    limits,
    progressIntervalMs: 0
  });
  return { storage, jobs, events, processors };
}

test('analysis stores sheet metadata, default sheet and initial mapping without row values', async () => {
  const { jobs, events, processors } = await setup();
  await processors.analyze('job-1');
  const job = jobs.jobs.get('job-1');

  assert.equal(job.status, 'READY');
  assert.equal(job.selectedSheet, 'RESUMEN');
  assert.deepEqual(job.workbookAnalysis.sheets.map((sheet) => sheet.name), ['RESUMEN', 'OTRA']);
  assert.deepEqual(job.mapping.fecha_fin, { type: 'COLUMN', column: 'Fecha Término' });
  assert.equal(JSON.stringify(job).includes('SOTO'), false);
  assert.deepEqual(events, ['job:started', 'job:stage']);
});

test('analysis marks invalid workbooks as failed and purges the upload', async () => {
  const { jobs, processors, storage } = await setup({}, {
    createInput: async (target) => {
      const { key, path: filePath } = await target.reserve({ extension: 'xlsx' });
      await fs.writeFile(filePath, 'not a workbook');
      return key;
    }
  });
  const { inputStorageKey } = jobs.jobs.get('job-1');

  await processors.analyze('job-1');
  const job = jobs.jobs.get('job-1');
  assert.equal(job.status, 'FAILED');
  assert.equal(job.errorCode, 'INVALID_WORKBOOK');
  assert.equal(await storage.exists(inputStorageKey), false);
});

async function readyJob(overrides = {}, options = {}) {
  const context = await setup({}, options);
  await context.processors.analyze('job-1');
  const job = context.jobs.jobs.get('job-1');
  Object.assign(job, { status: 'QUEUED_TRANSFORMATION', ...overrides });
  context.events.length = 0;
  return context;
}

test('transformation writes valid rows, reports progress and summarizes issues', async () => {
  const { jobs, events, storage, processors } = await readyJob();
  await processors.transform('job-1');
  const job = jobs.jobs.get('job-1');

  assert.equal(job.status, 'READY_TO_DOWNLOAD');
  assert.equal(job.validationSummary.totalRows, 3);
  assert.equal(job.validationSummary.validRows, 2);
  assert.deepEqual(job.validationSummary.issueGroups.map((group) => `${group.sampleRows}:${group.column}:${group.code}:${group.count}`), ['3:RUT:INVALID_RUT:1']);
  assert.ok(events.includes('job:progress'));
  assert.equal(events.at(-1), 'job:completed');

  const output = new ExcelJS.Workbook();
  await output.xlsx.readFile(storage.resolvePath(job.outputStorageKey));
  const sheet = output.getWorksheet('DATOS');
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getRow(2).getCell(1).value, '123456785');
  assert.equal(sheet.getRow(2).getCell(8).value, '09/05/2024');
});

test('strict mode fails the job when any row has errors', async () => {
  const { jobs, processors } = await readyJob({ mode: 'STRICT' });
  await processors.transform('job-1');
  const job = jobs.jobs.get('job-1');

  assert.equal(job.status, 'FAILED');
  assert.equal(job.errorCode, 'VALIDATION_FAILED');
  assert.equal(job.outputStorageKey, undefined);
});

test('cancellation stops the transformation and removes partial output', async () => {
  const { jobs, storage, processors } = await readyJob({}, { isCancelled: async () => true });
  await processors.transform('job-1');
  const job = jobs.jobs.get('job-1');

  assert.notEqual(job.status, 'READY_TO_DOWNLOAD');
  const files = await fs.readdir(storage.rootDir);
  assert.equal(files.length, 1, 'only the input upload remains');
});

test('cleanup expires stale jobs and deletes their files', async () => {
  const { jobs, events, storage, processors } = await setup({ status: 'READY', expiresAt: new Date(Date.now() - 1000) });
  const { inputStorageKey } = jobs.jobs.get('job-1');

  await processors.cleanup(new Date());
  assert.equal(jobs.jobs.get('job-1').status, 'EXPIRED');
  assert.equal(await storage.exists(inputStorageKey), false);
  assert.deepEqual(events, ['job:purged']);
});
