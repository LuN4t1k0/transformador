const { LocalTemporaryStorage } = require('../../../packages/storage/src');
const { QUEUE_NAMES, workerConcurrency } = require('../../../packages/queue/src');

const storage = new LocalTemporaryStorage({
  rootDir: process.env.TEMP_DIR || '/tmp/previley-excel-transformer',
  ttlMs: Number(process.env.TEMP_FILE_TTL_MS || 2 * 60 * 60 * 1000)
});

async function runCleanupTick() {
  const result = await storage.cleanup();
  if (result.deleted.length > 0) {
    console.log(JSON.stringify({
      event: 'cleanup:deleted',
      deleted: result.deleted.length
    }));
  }
}

console.log(JSON.stringify({
  event: 'worker:started',
  queues: QUEUE_NAMES,
  concurrency: workerConcurrency
}));

runCleanupTick().catch((error) => {
  console.error(JSON.stringify({ event: 'cleanup:error', message: error.message }));
});

setInterval(() => {
  runCleanupTick().catch((error) => {
    console.error(JSON.stringify({ event: 'cleanup:error', message: error.message }));
  });
}, 60 * 60 * 1000);
