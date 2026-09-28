const JOB_EVENTS = Object.freeze({
  QUEUED: 'job:queued',
  STARTED: 'job:started',
  STAGE: 'job:stage',
  PROGRESS: 'job:progress',
  COMPLETED: 'job:completed',
  FAILED: 'job:failed',
  CANCELLED: 'job:cancelled',
  PURGED: 'job:purged'
});

function jobRoom(jobId) {
  return `job:${jobId}`;
}

function sanitizeProgressPayload(payload) {
  return {
    jobId: payload.jobId,
    stage: payload.stage,
    processedRows: payload.processedRows,
    totalRows: payload.totalRows,
    progress: payload.progress
  };
}

module.exports = {
  JOB_EVENTS,
  jobRoom,
  sanitizeProgressPayload
};
