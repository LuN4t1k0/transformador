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

module.exports = {
  QUEUE_NAMES,
  defaultQueueOptions,
  workerConcurrency
};
