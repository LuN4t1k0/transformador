const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');

const loadPreview = () => import('../apps/web/lib/preview.js');
const loadApi = () => import('../apps/web/lib/api/mock-api.js');

test('masks RUT digits keeping format, first digits and verifier', async () => {
  const { maskRut } = await loadPreview();
  assert.equal(maskRut('10.231.091-8'), '10.•••.•••-8');
  assert.equal(maskRut('102310918'), '10••••••8');
  assert.equal(maskRut(null), null);
});

test('runs the template with the job mapping instead of the seed sources', async () => {
  const { runTemplate } = await loadPreview();
  const mapping = Object.fromEntries(planVitalPagexTemplate.columns.map((column) => [column.id, column.source]));
  mapping.fecha_fin = { type: 'COLUMN', column: 'Fecha Termino' };

  const [result] = runTemplate(
    [{ RUT: '10.231.091-8', 'Nombre completo': 'NEIRA QUINCHAHUAL MARIA', 'Fecha Termino': '19-10-2015' }],
    planVitalPagexTemplate,
    mapping
  );

  assert.equal(result.rowNumber, 2);
  assert.equal(result.output['FEC. FIN'], '19/10/2015');
  assert.equal(result.output.NOMBRE, 'MARIA');
});

test('summarizes results counting rows with errors as invalid', async () => {
  const { summarizeResults } = await loadPreview();
  const summary = summarizeResults([
    { rowNumber: 2, issues: [] },
    { rowNumber: 3, issues: [{ severity: 'error', code: 'INVALID_RUT', column: 'RUT' }, { severity: 'error', code: 'REQUIRED', column: 'RUT' }] },
    { rowNumber: 4, issues: [{ severity: 'warning', code: 'X', column: 'AFP' }] }
  ]);

  assert.deepEqual(
    { total: summary.totalRows, valid: summary.validRows, errors: summary.errorCount, warnings: summary.warningCount },
    { total: 3, valid: 2, errors: 2, warnings: 1 }
  );
  assert.equal(summary.issues[0].row, 3);
});

function waitForStatus(api, jobId, statuses) {
  return new Promise((resolve) => {
    const unsubscribe = api.subscribe(jobId, ({ job }) => {
      if (statuses.includes(job.status)) {
        unsubscribe();
        resolve(job);
      }
    });
  });
}

async function evaluateJobMapping(job) {
  const { evaluateMapping } = await import('../apps/web/lib/mapping.js');
  return evaluateMapping(planVitalPagexTemplate.columns, job.mapping, new Set(job.confirmedIds));
}

async function createReadyJob(api) {
  const job = await api.createJob({ fileName: 'pagex.xlsx', fileSize: 2048, templateId: 'planvital-pagex' });
  const { rows } = await evaluateJobMapping(job);
  const confirmedIds = rows.filter((row) => row.status === 'REQUIERE_CONFIRMACION').map((row) => row.column.id);
  return api.saveMapping(job.id, { mapping: job.mapping, confirmedIds });
}

test('job lifecycle: create, map, transform with progress, download and purge', async () => {
  const { createMockApi } = await loadApi();
  const api = createMockApi({ stepDelayMs: 0 });

  const created = await api.createJob({ fileName: 'pagex.xlsx', fileSize: 2048, templateId: 'planvital-pagex' });
  assert.equal(created.status, 'READY');
  assert.equal(created.selectedSheet, 'RESUMEN');
  await assert.rejects(api.transformJob(created.id), { code: 'MAPPING_INCOMPLETE' });

  const ready = await createReadyJob(api);
  const events = [];
  api.subscribe(ready.id, ({ type }) => events.push(type));
  const done = waitForStatus(api, ready.id, ['READY_TO_DOWNLOAD']);
  await api.transformJob(ready.id);
  const finished = await done;

  assert.ok(events.includes('job:progress'));
  assert.equal(finished.progress.processed, finished.progress.total);
  assert.equal(finished.summary.totalRows, finished.progress.total);
  assert.ok(finished.summary.errorCount > 0, 'sample data includes an invalid RUT');

  const download = await api.downloadJob(ready.id);
  assert.match(download.fileName, /\.csv$/);
  assert.equal((await api.getJob(ready.id)).status, 'PURGED');
});

test('changing sheet resets mapping and cancel stops the transformation', async () => {
  const { createMockApi } = await loadApi();
  const api = createMockApi({ stepDelayMs: 5 });
  const ready = await createReadyJob(api);

  const cancelled = waitForStatus(api, ready.id, ['CANCELLED']);
  await api.transformJob(ready.id);
  await api.cancelJob(ready.id);
  assert.equal((await cancelled).status, 'CANCELLED');

  const other = await createReadyJob(api);
  const switched = await api.selectSheet(other.id, 'DETALLE_CADENAS');
  assert.deepEqual(switched.confirmedIds, []);
  assert.ok((await evaluateJobMapping(switched)).counts.missing > 0);
});

test('persists only metadata and rehydrates jobs from storage', async () => {
  const { createMockApi } = await loadApi();
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };

  const first = createMockApi({ storage, stepDelayMs: 0 });
  const job = await first.createJob({ fileName: 'pagex.xlsx', fileSize: 2048, templateId: 'planvital-pagex' });
  const persisted = [...store.values()].join('');
  assert.doesNotMatch(persisted, /MARIA|Nombre completo":"[A-Z]/);

  const second = createMockApi({ storage, stepDelayMs: 0 });
  assert.equal((await second.getJob(job.id)).fileName, 'pagex.xlsx');
  assert.equal((await second.listJobs()).length, 1);
  await assert.rejects(second.getJob('missing'), { code: 'NOT_FOUND' });
});
