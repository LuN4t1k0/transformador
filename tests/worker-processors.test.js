const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { LocalTemporaryStorage } = require('../packages/storage/src');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { createProcessors } = require('../apps/worker/src/processors');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { resolveTemplateForHeaders } = require('../packages/template-engine/src/mapping');

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
  const auditEvents = [];
  const processors = createProcessors({
    audit: { record: async (entry) => auditEvents.push(entry) },
    templates: options.templates,
    jobs,
    storage,
    publish: async (jobId, type) => events.push(type),
    isCancelled: options.isCancelled || (async () => false),
    limits,
    progressIntervalMs: 0
  });
  return { storage, jobs, events, auditEvents, processors };
}

test('analysis stores sheet metadata and selects the only sheet with data, without row values', async () => {
  const { jobs, events, processors } = await setup();
  await processors.analyze('job-1');
  const job = jobs.jobs.get('job-1');

  assert.equal(job.status, 'READY');
  assert.equal(job.selectedSheet, 'RESUMEN');
  assert.deepEqual(job.workbookAnalysis.sheets.map((sheet) => sheet.name), ['RESUMEN', 'OTRA']);
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
  const template = validateTemplateConfig({ ...planVitalPagexTemplate, ...(options.template || {}) });
  const workingTemplate = resolveTemplateForHeaders(template, job.workbookAnalysis.sheets[0].headers);
  Object.assign(job, { status: 'QUEUED_TRANSFORMATION', workingTemplate, ...overrides });
  context.events.length = 0;
  return context;
}

test('transformation writes valid rows, reports progress and summarizes issues', async () => {
  const { jobs, events, auditEvents, storage, processors } = await readyJob();
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

  assert.equal(job.rejectedRows, 1);
  const completedAudit = auditEvents.find((entry) => entry.eventType === 'TRANSFORM_COMPLETED');
  assert.deepEqual({ total: completedAudit.metadata.totalRows, rejected: completedAudit.metadata.rejectedRows, format: completedAudit.metadata.outputFormat }, { total: 3, rejected: 1, format: 'XLSX' });
  assert.equal(JSON.stringify(auditEvents).includes('SOTO'), false, 'audit never stores row values');
  const rejects = new ExcelJS.Workbook();
  await rejects.xlsx.readFile(storage.resolvePath(job.rejectsStorageKey));
  const rejected = rejects.getWorksheet('RECHAZADAS');
  assert.deepEqual(rejected.getRow(1).values.slice(1, 4), ['Fila en el Excel', 'Problemas', 'RUT']);
  assert.deepEqual(rejected.getRow(2).values.slice(1, 4), [3, 'RUT: RUT con dígito verificador inválido. Revisa el dígito verificador (lo que va después del guion).', '17.654.321-0']);
});

test('transformation extends the expiry within the hard limit', async () => {
  const context = await readyJob();
  const job = context.jobs.jobs.get('job-1');
  job.createdAt = new Date(Date.now() - 23.5 * 60 * 60 * 1000);
  const processors = createProcessors({
    jobs: context.jobs,
    storage: context.storage,
    publish: async () => {},
    isCancelled: async () => false,
    limits: { ...limits, tempFileTtlMs: 2 * 60 * 60 * 1000, hardTempFileTtlMs: 24 * 60 * 60 * 1000 },
    progressIntervalMs: 0
  });
  await processors.transform('job-1');
  const expiresIn = job.expiresAt.getTime() - Date.now();
  assert.ok(expiresIn > 25 * 60 * 1000 && expiresIn <= 30 * 60 * 1000, `expires in ${expiresIn}`);
});

test('transformation writes delimited latin1 text when the template asks for it', async () => {
  const { jobs, storage, processors } = await readyJob({}, { template: { output: { format: 'DELIMITED', delimiter: '|', encoding: 'LATIN1', extension: 'txt' } } });
  await processors.transform('job-1');
  const job = jobs.jobs.get('job-1');

  assert.match(job.outputStorageKey, /\.txt$/);
  const lines = (await fs.readFile(storage.resolvePath(job.outputStorageKey), 'latin1')).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^RUT\|APELLIDO PATERNO\|/);
  assert.match(lines[1], /^123456785\|SOTO\|PEREZ\|JUAN\|\|01\/05\/2024\|03\/05\/2024\|09\/05\/2024\|/);
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

test('re-analysis with a header row override keeps the sheet and re-resolves the working template', async () => {
  const { jobs, processors } = await setup();
  await processors.analyze('job-1');
  const job = jobs.jobs.get('job-1');
  job.workingTemplate = resolveTemplateForHeaders(validateTemplateConfig(planVitalPagexTemplate), job.workbookAnalysis.sheets[0].headers);
  job.status = 'QUEUED_ANALYSIS';

  await processors.analyze('job-1', { headerRows: { RESUMEN: 2 } });
  const reanalyzed = jobs.jobs.get('job-1');
  assert.equal(reanalyzed.status, 'READY');
  assert.equal(reanalyzed.selectedSheet, 'RESUMEN');
  assert.equal(reanalyzed.workbookAnalysis.sheets[0].headerRow, 2);
  assert.deepEqual(reanalyzed.workbookAnalysis.headerRows, { RESUMEN: 2 });
  assert.ok(reanalyzed.workingTemplate.columns.length > 0);
});

test('analysis re-applies an earlier conversion configuration (repeat / reprocess rejects)', async () => {
  const context = await setup();
  await context.processors.analyze('job-1');
  const source = context.jobs.jobs.get('job-1');
  source.workingTemplate = resolveTemplateForHeaders(validateTemplateConfig(planVitalPagexTemplate), source.workbookAnalysis.sheets[0].headers);
  Object.assign(source, { templateId: 't1', templateVersionId: 'v1', confirmedIds: ['apellido_paterno', 'desconocida'], userId: 'u1' });

  const inputStorageKey = await createInput(context.storage);
  context.jobs.jobs.set('job-2', { id: 'job-2', userId: 'u1', status: 'QUEUED_ANALYSIS', inputStorageKey, reuseFromJobId: 'job-1', confirmedIds: [], expiresAt: new Date(Date.now() + 60000) });
  await context.processors.analyze('job-2');
  const reused = context.jobs.jobs.get('job-2');

  assert.equal(reused.status, 'READY');
  assert.equal(reused.selectedSheet, 'RESUMEN');
  assert.equal(reused.templateId, 't1');
  assert.equal(reused.workingTemplate.columns.length, 17);
  assert.deepEqual(reused.confirmedIds, ['apellido_paterno']);
});

test('analysis applies a requested saved template', async () => {
  const context = await setup({ requestedTemplateId: 'tpl-1' }, {
    templates: { getActive: async () => ({ id: 'tpl-1', versionId: 'ver-9', archivedAt: null, ...planVitalPagexTemplate }) }
  });
  await context.processors.analyze('job-1');
  const job = context.jobs.jobs.get('job-1');
  assert.equal(job.templateId, 'tpl-1');
  assert.equal(job.templateVersionId, 'ver-9');
  assert.deepEqual(job.workingTemplate.columns.find((column) => column.id === 'fecha_fin').source, { type: 'COLUMN', column: 'Fecha Término' });
});
