const { Worker } = require('bullmq');
const { config } = require('../../../packages/shared/src/config');
const { createPool, migrate } = require('../../../packages/shared/src/db');
const { createAuditRepository, createJobRepository, createTemplateRepository } = require('../../../packages/shared/src/repositories');
const { LocalTemporaryStorage } = require('../../../packages/storage/src');
const {
  QUEUE_NAMES,
  workerConcurrency,
  cancelFlagKey,
  createRedisConnection,
  createQueues,
  createEventPublisher
} = require('../../../packages/queue/src');
const { createProcessors } = require('./processors');

const CLEANUP_EVERY_MS = 10 * 60 * 1000;

function log(payload) {
  console.log(JSON.stringify(payload));
}

async function main() {
  const pool = createPool();
  await migrate(pool);

  const connection = createRedisConnection();
  const jobs = createJobRepository(pool);
  const storage = new LocalTemporaryStorage({ rootDir: process.env.TEMP_DIR || '/tmp/previley-excel-transformer', ttlMs: config.tempFileTtlMs });
  const processors = createProcessors({
    jobs,
    templates: createTemplateRepository(pool),
    storage,
    publish: createEventPublisher(connection),
    isCancelled: async (jobId) => (await connection.exists(cancelFlagKey(jobId))) === 1,
    limits: config,
    log,
    audit: createAuditRepository(pool, { log })
  });

  const handlers = {
    [QUEUE_NAMES.ANALYSIS]: (job) => processors.analyze(job.data.jobId, { headerRows: job.data.headerRows }),
    [QUEUE_NAMES.TRANSFORMATION]: (job) => processors.transform(job.data.jobId),
    [QUEUE_NAMES.CLEANUP]: async () => {
      const result = await processors.cleanup(new Date());
      if (result.expired || result.orphanFilesDeleted) log({ event: 'cleanup:done', ...result });
    }
  };

  const workers = Object.entries(handlers).map(([name, handler]) => {
    const worker = new Worker(name, handler, {
      connection,
      // MAX_CONCURRENT_JOBS bounds simultaneous transformations (the memory/CPU heavy queue).
      concurrency: name === QUEUE_NAMES.TRANSFORMATION ? config.maxConcurrentJobs : workerConcurrency[name]
    });

    worker.on('failed', async (job, error) => {
      log({ event: 'job:error', queue: name, jobId: job?.data?.jobId, attempt: job?.attemptsMade, message: error.message });
      // Mark the transformation job as failed once BullMQ gives up retrying.
      if (job?.data?.jobId && job.attemptsMade >= (job.opts.attempts || 1)) {
        const record = await jobs.get(job.data.jobId);
        if (record) await processors.fail(record, error).catch(() => {});
      }
    });
    return worker;
  });

  const { cleanup } = createQueues(connection);
  await cleanup.upsertJobScheduler('periodic-cleanup', { every: CLEANUP_EVERY_MS }, { name: 'cleanup' });

  log({ event: 'worker:started', queues: Object.keys(handlers), concurrency: { ...workerConcurrency, transformation: config.maxConcurrentJobs } });

  async function shutdown() {
    await Promise.all(workers.map((worker) => worker.close()));
    await connection.quit();
    await pool.end();
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'worker:fatal', message: error.message }));
  process.exit(1);
});
