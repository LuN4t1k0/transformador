// Domain packs (DOMAIN_PACKS) must be registered before any template is validated.
require('../../../packages/packs/register');
const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');
const { config } = require('../../../packages/shared/src/config');
const { JOB_STATUSES } = require('../../../packages/shared/src/job-statuses');
const { createPool, migrate } = require('../../../packages/shared/src/db');
const { createAuditRepository, createJobRepository, createTemplateRepository, createUserRepository } = require('../../../packages/shared/src/repositories');
const { seedTemplates } = require('../../../packages/shared/templates');
const { validateTemplateConfig } = require('../../../packages/template-engine/src/schema');
const { LocalTemporaryStorage } = require('../../../packages/storage/src');
const { QUEUE_NAMES, createEventPublisher, createQueues, createRedisConnection } = require('../../../packages/queue/src');
const { createAuthenticator } = require('./auth/authenticator');
const { HttpError, applyCors, createRouter, readJson, sendError, sendJson } = require('./http');
const { createJobService } = require('./jobs/service');
const { createTemplateService } = require('./templates/service');
const { createAssistantService } = require('./assistant/service');
const { createGeminiProvider } = require('./assistant/gemini');
const { attachRealtime } = require('./realtime/socket');

const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';

function log(payload) {
  console.log(JSON.stringify(payload));
}

async function main() {
  const pool = createPool();
  await migrate(pool);

  const users = createUserRepository(pool);
  const templates = createTemplateRepository(pool);
  const jobs = createJobRepository(pool);
  const systemUser = await users.upsertBySubject({ subject: 'system', email: 'system@previley.local', displayName: 'Sistema' });
  await templates.ensureSeeds(seedTemplates().map((seed) => ({ ...seed, configuration: validateTemplateConfig(seed.configuration) })), systemUser.id);

  const redis = createRedisConnection();
  const subscriber = createRedisConnection();
  const queues = createQueues(redis);
  const publish = createEventPublisher(redis);
  const storage = new LocalTemporaryStorage({ rootDir: process.env.TEMP_DIR || '/tmp/previley-excel-transformer', ttlMs: config.tempFileTtlMs });
  const authenticate = createAuthenticator({
    users,
    devUser: { email: process.env.DEV_USER_EMAIL, name: process.env.DEV_USER_NAME }
  });
  const audit = createAuditRepository(pool, { log });
  const templateService = createTemplateService({ templates, storage, config, audit });
  // The template assistant is optional: enabled only when a Gemini key is configured.
  const assistantService = createAssistantService({
    provider: process.env.GEMINI_API_KEY ? createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || null }) : null,
    audit
  });
  const jobService = createJobService({ jobs, templates, templateService, storage, queues, redis, publish, config, audit });

  const match = createRouter([
    ['GET', '/session', async ({ user }) => ({ user: { email: user.email, displayName: user.displayName } })],
    ['POST', '/auth/sso/callback', async () => {
      throw new HttpError(501, 'SSO_NOT_CONFIGURED', 'El adaptador de Previley SSO aún no está implementado.');
    }],
    ['GET', '/templates', async ({ url }) => ({ templates: await templateService.list({ includeArchived: url.searchParams.get('archived') === 'true' }) })],
    ['GET', '/templates/facets', async () => templateService.facets()],
    ['POST', '/templates/draft', async ({ request }) => templateService.draft(request)],
    ['GET', '/assistant/status', async () => assistantService.status()],
    ['POST', '/assistant/propose', async ({ user, request }) => assistantService.propose(await readJson(request), user)],
    ['POST', '/templates', async ({ user, request }) => ({ status: 201, body: { template: await templateService.create((await readJson(request)).configuration, user) } })],
    ['GET', '/templates/:templateId', async ({ params }) => ({ template: await templateService.get(params.templateId) })],
    ['GET', '/templates/:templateId/example', async ({ params, response }) => {
      const { fileName, buffer } = await templateService.example(params.templateId);
      response.writeHead(200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'cache-control': 'no-store'
      });
      response.end(buffer);
      return { handled: true };
    }],
    ['GET', '/templates/:templateId/versions/:versionId', async ({ params }) => ({ template: await templateService.getVersion(params.templateId, params.versionId) })],
    ['POST', '/templates/:templateId/versions', async ({ user, params, request }) => ({ template: await templateService.addVersion(params.templateId, (await readJson(request)).configuration, user) })],
    ['POST', '/templates/:templateId/duplicate', async ({ user, params, request }) => ({ status: 201, body: { template: await templateService.duplicate(params.templateId, await readJson(request), user) } })],
    ['POST', '/templates/:templateId/archive', async ({ user, params }) => ({ template: await templateService.setArchived(params.templateId, true, user) })],
    ['POST', '/templates/:templateId/delete', async ({ user, params, request }) => templateService.remove(params.templateId, await readJson(request), user)],
    ['POST', '/templates/:templateId/unarchive', async ({ user, params }) => ({ template: await templateService.setArchived(params.templateId, false, user) })],
    ['GET', '/jobs', async ({ user }) => ({ jobs: await jobService.list(user) })],
    ['POST', '/jobs', async ({ user, request }) => ({ status: 201, body: { job: await jobService.create(request, user) } })],
    ['GET', '/jobs/:jobId', async ({ user, params }) => ({ job: await jobService.get(params.jobId, user) })],
    ['GET', '/jobs/:jobId/activity', async ({ user, params }) => ({ events: await jobService.activity(params.jobId, user) })],
    ['PATCH', '/jobs/:jobId/sheet', async ({ user, params, request }) => ({ job: await jobService.selectSheet(params.jobId, user, await readJson(request)) })],
    ['GET', '/jobs/:jobId/template-matches', async ({ user, params }) => ({ matches: await jobService.templateMatches(params.jobId, user) })],
    ['POST', '/jobs/:jobId/template', async ({ user, params, request }) => ({ job: await jobService.applyTemplate(params.jobId, user, await readJson(request)) })],
    ['POST', '/jobs/:jobId/template/from-example', async ({ user, params, request }) => jobService.templateFromExample(params.jobId, user, request)],
    ['PATCH', '/jobs/:jobId/working-template', async ({ user, params, request }) => ({ job: await jobService.saveWorkingTemplate(params.jobId, user, await readJson(request)) })],
    ['POST', '/jobs/:jobId/template/save', async ({ user, params, request }) => ({ job: await jobService.saveTemplate(params.jobId, user, await readJson(request)) })],
    ['GET', '/jobs/:jobId/sample', async ({ user, params }) => jobService.sample(params.jobId, user)],
    ['POST', '/jobs/:jobId/transform', async ({ user, params, request }) => ({ job: await jobService.transform(params.jobId, user, await readJson(request)) })],
    ['POST', '/jobs/:jobId/purge', async ({ user, params }) => ({ job: await jobService.purge(params.jobId, user) })],
    ['POST', '/jobs/:jobId/cancel', async ({ user, params }) => ({ job: await jobService.cancel(params.jobId, user) })],
    ['GET', '/jobs/:jobId/download', async ({ user, params, response, url }) => {
      await jobService.download(params.jobId, user, response, { file: url.searchParams.get('file') === 'rejects' ? 'rejects' : 'output' });
      return { handled: true };
    }]
  ]);

  const server = http.createServer(async (request, response) => {
    const incomingId = request.headers['x-request-id'];
    const requestId = typeof incomingId === 'string' && /^[\w-]{8,64}$/.test(incomingId) ? incomingId : crypto.randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      if (request.method === 'OPTIONS' || request.url === '/health') return;
      log({ event: 'http:request', requestId, method: request.method, path: request.url.split('?')[0], status: response.statusCode, durationMs: Date.now() - startedAt });
    });
    applyCors(request, response, allowedOrigin);
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;

    if (request.method === 'GET' && pathname === '/health') {
      const [postgres, redisStatus] = await Promise.all([
        pool.query('select 1').then(() => ({ ok: true }), (error) => ({ ok: false, reason: error.code || error.message })),
        redis.ping().then(() => ({ ok: true }), (error) => ({ ok: false, reason: error.message }))
      ]);
      const ok = postgres.ok && redisStatus.ok;
      sendJson(response, ok ? 200 : 503, { status: ok ? 'ok' : 'degraded', service: 'previley-excel-transformer-api', dependencies: { postgres, redis: redisStatus } });
      return;
    }

    if (request.method === 'GET' && pathname === '/config') {
      sendJson(response, 200, { config, queues: QUEUE_NAMES, jobStatuses: JOB_STATUSES });
      return;
    }

    const route = match(request.method, pathname);
    try {
      if (!route) throw new HttpError(404, 'NOT_FOUND', 'Ruta no encontrada.');
      if (route.methodNotAllowed) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');
      const user = await authenticate(request.headers);
      const result = await route.handler({ request, response, url, params: route.params, user });
      if (result?.handled) return;
      if (result?.status) sendJson(response, result.status, result.body);
      else sendJson(response, 200, result);
    } catch (error) {
      if (!(error instanceof HttpError)) log({ event: 'http:error', requestId, method: request.method, path: pathname, message: error.message });
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (!request.readableEnded) request.resume();
      sendError(response, error);
    }
  });

  attachRealtime(server, { authenticate, jobService, jobs, subscriber, allowedOrigin, log });

  server.listen(port, '0.0.0.0', () => {
    log({ event: 'api:started', port, authMode: process.env.AUTH_MODE || 'sso', webOrigin: allowedOrigin });
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'api:fatal', message: error.message }));
  process.exit(1);
});
