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

function setup({ active = 0 } = {}) {
  const updates = [];
  const service = createJobService({
    jobs: {
      getForUser: async () => ({ ...baseJob }),
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
