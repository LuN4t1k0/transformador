const test = require('node:test');
const assert = require('node:assert/strict');
const { createJobService } = require('../apps/api/src/jobs/service');

const user = { id: 'u1' };
const baseJob = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'u1',
  status: 'READY',
  selectedSheet: 'S',
  createdAt: new Date(Date.now() - 60 * 60 * 1000),
  confirmedIds: [],
  workbookAnalysis: { sheets: [{ name: 'S', headers: ['A'], rowCount: 1 }] },
  workingTemplate: { name: 'T', output: { format: 'XLSX' }, columns: [{ id: 'a', outputName: 'A', required: false, source: { type: 'COLUMN', column: 'A' }, transformations: [] }] }
};
const config = { tempFileTtlMs: 2 * 60 * 60 * 1000, hardTempFileTtlMs: 24 * 60 * 60 * 1000, maxActiveJobsPerUser: 2 };

function setup({ active = 0, job = baseJob } = {}) {
  const updates = [];
  const service = createJobService({
    jobs: {
      getForUser: async () => ({ ...job }),
      countActiveForUser: async () => active,
      update: async (id, changes) => {
        updates.push(changes);
        return { ...baseJob, ...changes };
      }
    },
    templates: { getVersion: async () => null },
    queues: { transformation: { add: async () => {} } },
    redis: { del: async () => {} },
    publish: async () => {},
    config
  });
  return { service, updates };
}

test('rejects new work when the user already has the maximum of active jobs', async () => {
  const { service } = setup({ active: 2 });
  await assert.rejects(service.transform(baseJob.id, user, {}), { status: 429, code: 'TOO_MANY_ACTIVE_JOBS' });
});

test('transform stores the chosen mode and extends expiry within the hard limit', async () => {
  const { service, updates } = setup();
  await service.transform(baseJob.id, user, { mode: 'STRICT' });
  assert.equal(updates[0].mode, 'STRICT');
  const expiresIn = updates[0].expiresAt.getTime() - Date.now();
  assert.ok(expiresIn > 1.9 * 60 * 60 * 1000 && expiresIn <= 2 * 60 * 60 * 1000);
  await assert.rejects(service.transform(baseJob.id, user, { mode: 'OTHER' }), { code: 'INVALID_MODE' });
});

test('transform validates and stores the values of the template parameters', async () => {
  const parameters = [{ id: 'periodo', name: 'Periodo', type: 'DATE', required: true, defaultValue: '' }, { id: 'tasa', name: 'Tasa', type: 'NUMBER', required: false, defaultValue: '5' }];
  const { service, updates } = setup({ job: { ...baseJob, workingTemplate: { ...baseJob.workingTemplate, parameters } } });
  await assert.rejects(service.transform(baseJob.id, user, {}), { status: 400, code: 'INVALID_PARAMETERS', message: 'Falta el valor de «Periodo».' });
  await assert.rejects(service.transform(baseJob.id, user, { parameters: { periodo: 'mayo' } }), { status: 400, code: 'INVALID_PARAMETERS' });
  await service.transform(baseJob.id, user, { parameters: { periodo: '31/05/2024', otro: 'x' } });
  assert.deepEqual(updates[0].runParameters, { periodo: '2024-05-31', tasa: 5 });
});
