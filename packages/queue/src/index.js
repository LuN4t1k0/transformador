const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const QUEUE_NAMES = Object.freeze({
  ANALYSIS: 'analysis',
  TRANSFORMATION: 'transformation',
  CLEANUP: 'cleanup'
});

const defaultQueueOptions = Object.freeze({
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 1000
  },
  removeOnFail: {
    age: 24 * 60 * 60,
    count: 1000
  }
});

const workerConcurrency = Object.freeze({
  analysis: 2,
  transformation: 1,
  cleanup: 1
});

// Worker → API channel. Payloads carry only { jobId, type }; the API reloads metadata before emitting.
const JOB_EVENTS_CHANNEL = 'job-events';

function cancelFlagKey(jobId) {
  return `job:cancel:${jobId}`;
}

function createRedisConnection(url = process.env.REDIS_URL) {
  if (!url) throw new Error('REDIS_URL is required');
  // BullMQ workers require maxRetriesPerRequest = null.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

function createQueues(connection) {
  return {
    analysis: new Queue(QUEUE_NAMES.ANALYSIS, { connection, defaultJobOptions: defaultQueueOptions }),
    transformation: new Queue(QUEUE_NAMES.TRANSFORMATION, { connection, defaultJobOptions: defaultQueueOptions }),
    cleanup: new Queue(QUEUE_NAMES.CLEANUP, { connection, defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 } })
  };
}

function createEventPublisher(connection) {
  return (jobId, type) => connection.publish(JOB_EVENTS_CHANNEL, JSON.stringify({ jobId, type }));
}

module.exports = {
  QUEUE_NAMES,
  JOB_EVENTS_CHANNEL,
  defaultQueueOptions,
  workerConcurrency,
  cancelFlagKey,
  createRedisConnection,
  createQueues,
  createEventPublisher
};
