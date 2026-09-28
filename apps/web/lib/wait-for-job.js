import { api } from './api';

const TERMINAL = new Set(['READY_TO_DOWNLOAD', 'DOWNLOADED', 'PURGED', 'FAILED', 'CANCELLED', 'EXPIRED']);

// Polls a job until `isDone(job)` or a terminal status; used by flows that orchestrate several jobs.
export async function waitForJob(jobId, isDone, { intervalMs = 800, timeoutMs = 10 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await api.getJob(jobId);
    if (isDone(job) || TERMINAL.has(job.status)) return job;
    if (Date.now() > deadline) throw new Error('El proceso está tardando más de lo esperado. Revísalo en el historial.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
