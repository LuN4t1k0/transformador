import { io } from 'socket.io-client';

const JOB_EVENTS = ['job:queued', 'job:started', 'job:stage', 'job:progress', 'job:completed', 'job:failed', 'job:cancelled', 'job:purged'];

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function parseFileName(disposition, fallback) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (encoded) return decodeURIComponent(encoded[1]);
  const plain = /filename="([^"]+)"/i.exec(disposition || '');
  return plain ? plain[1] : fallback;
}

export function createHttpApi(baseUrl) {
  const listeners = new Map();
  const connectionListeners = new Set();
  let socket = null;

  async function request(path, { method = 'GET', json, body } = {}) {
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: json ? { 'content-type': 'application/json' } : undefined,
        body: json ? JSON.stringify(json) : body
      });
    } catch {
      throw new ApiError('NETWORK_ERROR', 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 0);
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(data?.error?.code || `HTTP_${response.status}`, data?.error?.message || 'Ocurrió un error inesperado.', response.status);
    }
    return response;
  }

  const getJson = async (path, options) => (await request(path, options)).json();

  function notify(job, type) {
    for (const listener of listeners.get(job.id) || []) listener({ type, job });
  }

  function joinRoom(jobId) {
    socket.emit('job:subscribe', jobId, (result) => {
      // Rehydrate on every (re)subscription so events missed while disconnected are recovered.
      if (result?.ok) notify(result.job, 'job:rehydrated');
    });
  }

  function getSocket() {
    if (socket) return socket;
    socket = io(baseUrl, { withCredentials: true });
    socket.on('connect', () => {
      for (const jobId of listeners.keys()) joinRoom(jobId);
      connectionListeners.forEach((listener) => listener(true));
    });
    socket.on('disconnect', () => connectionListeners.forEach((listener) => listener(false)));
    socket.on('connect_error', () => connectionListeners.forEach((listener) => listener(false)));
    for (const type of JOB_EVENTS) socket.on(type, (payload) => payload?.job && notify(payload.job, type));
    return socket;
  }

  return {
    async getSession() {
      return (await getJson('/session')).user;
    },
    async listTemplates() {
      return (await getJson('/templates')).templates;
    },
    async listJobs() {
      return (await getJson('/jobs')).jobs;
    },
    async getJob(jobId) {
      return (await getJson(`/jobs/${encodeURIComponent(jobId)}`)).job;
    },
    async createJob({ file, templateId }) {
      const form = new FormData();
      form.append('templateId', templateId);
      form.append('file', file, file.name);
      return (await getJson('/jobs', { method: 'POST', body: form })).job;
    },
    async selectSheet(jobId, sheetName) {
      return (await getJson(`/jobs/${jobId}/sheet`, { method: 'PATCH', json: { sheetName } })).job;
    },
    async saveMapping(jobId, { mapping, confirmedIds }) {
      return (await getJson(`/jobs/${jobId}/mapping`, { method: 'PATCH', json: { mapping, confirmedIds } })).job;
    },
    async previewJob(jobId) {
      return getJson(`/jobs/${jobId}/preview`, { method: 'POST' });
    },
    async transformJob(jobId) {
      return (await getJson(`/jobs/${jobId}/transform`, { method: 'POST' })).job;
    },
    async cancelJob(jobId) {
      return (await getJson(`/jobs/${jobId}/cancel`, { method: 'POST' })).job;
    },
    async downloadJob(jobId) {
      const response = await request(`/jobs/${jobId}/download`);
      return {
        fileName: parseFileName(response.headers.get('content-disposition'), 'resultado.xlsx'),
        blob: await response.blob()
      };
    },
    subscribe(jobId, listener) {
      const client = getSocket();
      const set = listeners.get(jobId) || new Set();
      const isFirst = set.size === 0;
      set.add(listener);
      listeners.set(jobId, set);
      if (isFirst && client.connected) joinRoom(jobId);
      return () => {
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(jobId);
          client.emit('job:unsubscribe', jobId);
        }
      };
    },
    onConnectionChange(listener) {
      connectionListeners.add(listener);
      listener(getSocket().connected);
      return () => connectionListeners.delete(listener);
    }
  };
}
