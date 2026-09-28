import { JOB_STATUSES } from '@previley-transformer/shared/src/job-statuses.js';
import { createInitialMapping, evaluateMapping } from '../mapping.js';
import { runTemplate, summarizeResults } from '../preview.js';
import { getTemplate } from '../templates.js';
import { analyzeSampleWorkbook, getSampleRows } from './mock-workbook.js';

// In-browser stand-in for the Node API + BullMQ worker described in docs/SDD.md.
// It exposes the same operations and Socket.IO-style events so pages can later switch to HTTP
// without changes. Only job metadata is persisted; sheet rows stay inside mock-workbook.js.

const STORAGE_KEY = 'previley.jobs.v1';
const TEMP_FILE_TTL_MS = 2 * 60 * 60 * 1000;
const PREVIEW_ROWS = 5;
const RUNNING_STATUSES = new Set([
  JOB_STATUSES.QUEUED_TRANSFORMATION,
  JOB_STATUSES.TRANSFORMING,
  JOB_STATUSES.VALIDATING,
  JOB_STATUSES.GENERATING
]);
const FINAL_STATUSES = new Set([
  JOB_STATUSES.PURGED,
  JOB_STATUSES.EXPIRED,
  JOB_STATUSES.CANCELLED,
  JOB_STATUSES.FAILED
]);

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function getSessionStorage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createId() {
  return `job_${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockApi({ storage = getSessionStorage(), stepDelayMs = 450, now = () => Date.now() } = {}) {
  const listeners = new Map();
  const runs = new Map();
  let jobs = null;

  function load() {
    if (jobs) return jobs;
    try {
      jobs = new Map(Object.entries(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')));
    } catch {
      jobs = new Map();
    }
    return jobs;
  }

  function persist() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(load())));
    } catch {
      // Storage may be unavailable (private mode, quota); jobs remain in memory.
    }
  }

  function emit(jobId, type, job) {
    for (const listener of listeners.get(jobId) || []) listener({ type, job });
  }

  function update(jobId, changes, eventType = 'job:stage') {
    const job = { ...requireJob(jobId), ...changes, updatedAt: new Date(now()).toISOString() };
    load().set(jobId, job);
    persist();
    emit(jobId, eventType, job);
    return job;
  }

  function requireJob(jobId) {
    const job = load().get(jobId);
    if (!job) throw new ApiError('NOT_FOUND', 'El job no existe o ya no está disponible en esta sesión.');
    return job;
  }

  function refresh(jobId) {
    const job = requireJob(jobId);
    if (!FINAL_STATUSES.has(job.status) && job.status !== JOB_STATUSES.DOWNLOADED && now() > Date.parse(job.expiresAt)) {
      return update(jobId, { status: JOB_STATUSES.EXPIRED, stage: null }, 'job:purged');
    }
    // A reload kills the in-memory worker; resume it like BullMQ would retry a stalled job.
    if (RUNNING_STATUSES.has(job.status) && !runs.has(jobId)) runTransformation(jobId);
    return job;
  }

  function assertEditable(job) {
    if (job.status !== JOB_STATUSES.READY) {
      throw new ApiError('JOB_LOCKED', 'El job ya no admite cambios de configuración.');
    }
  }

  function buildResults(job) {
    return runTemplate(getSampleRows(job.selectedSheet), getTemplate(job.templateId), job.mapping);
  }

  async function runTransformation(jobId) {
    const run = { cancelled: false };
    runs.set(jobId, run);
    const results = buildResults(requireJob(jobId));
    const total = results.length;

    try {
      update(jobId, { status: JOB_STATUSES.TRANSFORMING, stage: 'TRANSFORMING', progress: { processed: 0, total } }, 'job:started');
      for (let processed = 1; processed <= total; processed += 1) {
        await wait(stepDelayMs);
        if (run.cancelled) return;
        update(jobId, { progress: { processed, total } }, 'job:progress');
      }

      await wait(stepDelayMs);
      if (run.cancelled) return;
      update(jobId, { status: JOB_STATUSES.VALIDATING, stage: 'VALIDATING' });
      const summary = summarizeResults(results);

      await wait(stepDelayMs);
      if (run.cancelled) return;
      update(jobId, { status: JOB_STATUSES.GENERATING, stage: 'GENERATING' });

      await wait(stepDelayMs);
      if (run.cancelled) return;
      update(jobId, { status: JOB_STATUSES.READY_TO_DOWNLOAD, stage: null, summary }, 'job:completed');
    } catch (error) {
      update(jobId, { status: JOB_STATUSES.FAILED, stage: null, error: error.message }, 'job:failed');
    } finally {
      runs.delete(jobId);
    }
  }

  return {
    async listJobs() {
      return [...load().keys()]
        .map(refresh)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async getJob(jobId) {
      return refresh(jobId);
    },

    async createJob({ fileName, fileSize, templateId }) {
      const template = getTemplate(templateId);
      if (!template) throw new ApiError('TEMPLATE_NOT_FOUND', 'La plantilla seleccionada no existe.');

      const sheets = analyzeSampleWorkbook();
      const selectedSheet = sheets.some((sheet) => sheet.name === template.input.sheet) ? template.input.sheet : sheets[0].name;
      const headers = sheets.find((sheet) => sheet.name === selectedSheet).headers;
      const createdAt = new Date(now());
      const job = {
        id: createId(),
        status: JOB_STATUSES.READY,
        fileName,
        fileSize,
        templateId,
        mode: 'LENIENT',
        sheets,
        selectedSheet,
        mapping: createInitialMapping(template.columns, headers),
        confirmedIds: [],
        stage: null,
        progress: null,
        summary: null,
        error: null,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + TEMP_FILE_TTL_MS).toISOString()
      };

      load().set(job.id, job);
      persist();
      return job;
    },

    async selectSheet(jobId, sheetName) {
      const job = refresh(jobId);
      assertEditable(job);
      const sheet = job.sheets.find((candidate) => candidate.name === sheetName);
      if (!sheet) throw new ApiError('SHEET_NOT_FOUND', `La hoja «${sheetName}» no existe en el archivo.`);

      const template = getTemplate(job.templateId);
      return update(jobId, {
        selectedSheet: sheet.name,
        mapping: createInitialMapping(template.columns, sheet.headers),
        confirmedIds: []
      });
    },

    async saveMapping(jobId, { mapping, confirmedIds }) {
      assertEditable(refresh(jobId));
      return update(jobId, { mapping, confirmedIds: [...confirmedIds] });
    },

    async previewJob(jobId) {
      const job = refresh(jobId);
      return { rows: buildResults(job).slice(0, PREVIEW_ROWS) };
    },

    async transformJob(jobId) {
      const job = refresh(jobId);
      assertEditable(job);
      const template = getTemplate(job.templateId);
      if (!evaluateMapping(template.columns, job.mapping, new Set(job.confirmedIds)).isComplete) {
        throw new ApiError('MAPPING_INCOMPLETE', 'Resuelve el mapeo antes de transformar.');
      }

      const queued = update(jobId, { status: JOB_STATUSES.QUEUED_TRANSFORMATION, stage: 'QUEUED', summary: null }, 'job:queued');
      runTransformation(jobId);
      return queued;
    },

    async cancelJob(jobId) {
      const job = refresh(jobId);
      if (!RUNNING_STATUSES.has(job.status)) throw new ApiError('NOT_CANCELLABLE', 'El job no está en proceso.');
      const run = runs.get(jobId);
      if (run) run.cancelled = true;
      return update(jobId, { status: JOB_STATUSES.CANCELLED, stage: null }, 'job:cancelled');
    },

    async downloadJob(jobId) {
      const job = refresh(jobId);
      if (job.status !== JOB_STATUSES.READY_TO_DOWNLOAD) {
        throw new ApiError('NOT_READY', 'El archivo no está disponible para descarga.');
      }

      const template = getTemplate(job.templateId);
      const invalidRows = new Set(job.summary.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.row));
      const headers = [...template.columns].sort((a, b) => a.position - b.position).map((column) => column.outputName);
      const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = buildResults(job)
        .filter((result) => !invalidRows.has(result.rowNumber))
        .map((result) => headers.map((header) => escape(result.output[header])).join(';'));
      const content = [headers.map(escape).join(';'), ...lines].join('\n');
      const baseName = job.fileName.replace(/\.xlsx$/i, '');

      update(jobId, { status: JOB_STATUSES.DOWNLOADED }, 'job:stage');
      // Policy: purge the temporary output right after download.
      update(jobId, { status: JOB_STATUSES.PURGED }, 'job:purged');

      return {
        fileName: `${baseName}-${template.output.sheetName}-ejemplo.csv`,
        blob: new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' })
      };
    },

    subscribe(jobId, listener) {
      const set = listeners.get(jobId) || new Set();
      set.add(listener);
      listeners.set(jobId, set);
      return () => set.delete(listener);
    }
  };
}
