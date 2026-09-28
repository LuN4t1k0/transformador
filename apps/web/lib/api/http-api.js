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
    async listTemplates({ includeArchived = false } = {}) {
      return (await getJson(`/templates${includeArchived ? '?archived=true' : ''}`)).templates;
    },
    async getTemplateFacets() {
      return getJson('/templates/facets');
    },
    async getTemplate(templateId) {
      return (await getJson(`/templates/${templateId}`)).template;
    },
    async getTemplateVersion(templateId, versionId) {
      return (await getJson(`/templates/${templateId}/versions/${versionId}`)).template;
    },
    async createTemplate(configuration) {
      return (await getJson('/templates', { method: 'POST', json: { configuration } })).template;
    },
    async addTemplateVersion(templateId, configuration) {
      return (await getJson(`/templates/${templateId}/versions`, { method: 'POST', json: { configuration } })).template;
    },
    async duplicateTemplate(templateId, name) {
      return (await getJson(`/templates/${templateId}/duplicate`, { method: 'POST', json: { name } })).template;
    },
    async createTemplateDraft({ input, output }) {
      const form = new FormData();
      if (input) form.append('input', input, input.name);
      if (output) form.append('output', output, output.name);
      return getJson('/templates/draft', { method: 'POST', body: form });
    },
    async downloadTemplateExample(templateId) {
      const response = await request(`/templates/${templateId}/example`);
      return { fileName: parseFileName(response.headers.get('content-disposition'), 'ejemplo.xlsx'), blob: await response.blob() };
    },
    async setTemplateArchived(templateId, archived) {
      return (await getJson(`/templates/${templateId}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' })).template;
    },
    async listJobs() {
      return (await getJson('/jobs')).jobs;
    },
    async getJobActivity(jobId) {
      return (await getJson(`/jobs/${jobId}/activity`)).events;
    },
    async getJob(jobId) {
      return (await getJson(`/jobs/${encodeURIComponent(jobId)}`)).job;
    },
    async createJob({ file, reuseFromJobId, templateId }) {
      const form = new FormData();
      if (reuseFromJobId) form.append('reuseFromJobId', reuseFromJobId);
      if (templateId) form.append('templateId', templateId);
      form.append('file', file, file.name);
      return (await getJson('/jobs', { method: 'POST', body: form })).job;
    },
    async selectSheet(jobId, sheetName, headerRow) {
      return (await getJson(`/jobs/${jobId}/sheet`, { method: 'PATCH', json: { sheetName, ...(headerRow ? { headerRow } : {}) } })).job;
    },
    async getTemplateMatches(jobId) {
      return (await getJson(`/jobs/${jobId}/template-matches`)).matches;
    },
    async applyTemplate(jobId, selection) {
      return (await getJson(`/jobs/${jobId}/template`, { method: 'POST', json: selection })).job;
    },
    async saveWorkingTemplate(jobId, { template, confirmedIds }) {
      return (await getJson(`/jobs/${jobId}/working-template`, { method: 'PATCH', json: { template, confirmedIds } })).job;
    },
    async saveJobTemplate(jobId, payload) {
      return (await getJson(`/jobs/${jobId}/template/save`, { method: 'POST', json: payload })).job;
    },
    async getSample(jobId) {
      return getJson(`/jobs/${jobId}/sample`);
    },
    async transformJob(jobId, { mode = 'LENIENT' } = {}) {
      return (await getJson(`/jobs/${jobId}/transform`, { method: 'POST', json: { mode } })).job;
    },
    async purgeJob(jobId) {
      return (await getJson(`/jobs/${jobId}/purge`, { method: 'POST' })).job;
    },
    async cancelJob(jobId) {
      return (await getJson(`/jobs/${jobId}/cancel`, { method: 'POST' })).job;
    },
    async downloadJob(jobId, file = 'output') {
      const response = await request(`/jobs/${jobId}/download${file === 'rejects' ? '?file=rejects' : ''}`);
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
