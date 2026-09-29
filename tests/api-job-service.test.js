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

test('deleting a job hides it, cancels pending work and removes temporary files', async () => {
  const deleted = [];
  const removed = [];
  const cancelFlags = [];
  const job = { ...baseJob, status: 'QUEUED_ANALYSIS', inputStorageKey: 'input.xlsx', outputStorageKey: 'out.xlsx', rejectsStorageKey: 'bad.xlsx' };
  const service = createJobService({
    jobs: {
      getForUser: async () => ({ ...job }),
      markDeletedForUser: async (id, userId, options) => {
        deleted.push({ id, userId, options });
        return { ...job, status: options.cancel ? 'CANCELLED' : job.status, previousStatus: job.status };
      }
    },
    templates: { getVersion: async () => null },
    storage: { delete: async (key) => removed.push(key) },
    queues: { analysis: { remove: async (id) => removed.push(`analysis:${id}`) }, transformation: { remove: async (id) => removed.push(`transformation:${id}`) } },
    redis: { set: async (...args) => cancelFlags.push(args) },
    publish: async () => {},
    audit: { record: async () => {} },
    config
  });

  await assert.deepEqual(await service.remove(baseJob.id, user), { deleted: true });
  assert.deepEqual(deleted, [{ id: baseJob.id, userId: user.id, options: { cancel: true } }]);
  assert.deepEqual(removed.sort(), [`analysis:${baseJob.id}`, 'bad.xlsx', 'input.xlsx', 'out.xlsx', `transformation:${baseJob.id}`].sort());
  assert.equal(cancelFlags.length, 1);
});

test('deleting all jobs returns the amount removed', async () => {
  const service = createJobService({
    jobs: {
      markAllDeletedForUser: async (userId, options) => [
        { ...baseJob, id: '00000000-0000-0000-0000-000000000002', userId, status: 'CANCELLED', previousStatus: 'READY', inputStorageKey: 'a.xlsx' },
        { ...baseJob, id: '00000000-0000-0000-0000-000000000003', userId, status: 'DOWNLOADED', previousStatus: 'DOWNLOADED', outputStorageKey: 'b.xlsx' }
      ].map((job) => ({ ...job, options }))
    },
    templates: { getVersion: async () => null },
    storage: { delete: async () => {} },
    queues: { analysis: { remove: async () => {} }, transformation: { remove: async () => {} } },
    redis: { set: async () => {} },
    publish: async () => {},
    audit: { record: async () => {} },
    config
  });

  assert.deepEqual(await service.removeAll(user), { deleted: 2 });
});
