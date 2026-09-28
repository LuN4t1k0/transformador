const http = require('node:http');
const { URL } = require('node:url');
const { config } = require('../../../packages/shared/src/config');
const { JOB_STATUSES } = require('../../../packages/shared/src/job-statuses');
const { createPool, migrate } = require('../../../packages/shared/src/db');
const { createJobRepository, createTemplateRepository, createUserRepository } = require('../../../packages/shared/src/repositories');
const { seedTemplates } = require('../../../packages/shared/templates');
const { LocalTemporaryStorage } = require('../../../packages/storage/src');
const { QUEUE_NAMES, createEventPublisher, createQueues, createRedisConnection } = require('../../../packages/queue/src');
const { createAuthenticator } = require('./auth/authenticator');
const { HttpError, applyCors, createRouter, readJson, sendError, sendJson } = require('./http');
const { createJobService } = require('./jobs/service');
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
  await templates.ensureSeeds(seedTemplates, systemUser.id);

  const redis = createRedisConnection();
  const subscriber = createRedisConnection();
  const queues = createQueues(redis);
  const publish = createEventPublisher(redis);
  const storage = new LocalTemporaryStorage({ rootDir: process.env.TEMP_DIR || '/tmp/previley-excel-transformer', ttlMs: config.tempFileTtlMs });
  const authenticate = createAuthenticator({
    users,
    devUser: { email: process.env.DEV_USER_EMAIL, name: process.env.DEV_USER_NAME }
  });
  const jobService = createJobService({ jobs, templates, storage, queues, redis, publish, config });

  const match = createRouter([
    ['GET', '/session', async ({ user }) => ({ user: { email: user.email, displayName: user.displayName } })],
    ['POST', '/auth/sso/callback', async () => {
      throw new HttpError(501, 'SSO_NOT_CONFIGURED', 'El adaptador de Previley SSO aún no está implementado.');
    }],
    ['GET', '/templates', async () => ({ templates: await jobService.listTemplates() })],
    ['GET', '/jobs', async ({ user }) => ({ jobs: await jobService.list(user) })],
    ['POST', '/jobs', async ({ user, request }) => ({ status: 201, body: { job: await jobService.create(request, user) } })],
    ['GET', '/jobs/:jobId', async ({ user, params }) => ({ job: await jobService.get(params.jobId, user) })],
    ['PATCH', '/jobs/:jobId/sheet', async ({ user, params, request }) => ({ job: await jobService.selectSheet(params.jobId, user, await readJson(request)) })],
    ['PATCH', '/jobs/:jobId/mapping', async ({ user, params, request }) => ({ job: await jobService.saveMapping(params.jobId, user, await readJson(request)) })],
    ['POST', '/jobs/:jobId/preview', async ({ user, params }) => jobService.preview(params.jobId, user)],
    ['POST', '/jobs/:jobId/transform', async ({ user, params }) => ({ job: await jobService.transform(params.jobId, user) })],
    ['POST', '/jobs/:jobId/cancel', async ({ user, params }) => ({ job: await jobService.cancel(params.jobId, user) })],
    ['GET', '/jobs/:jobId/download', async ({ user, params, response }) => {
      await jobService.download(params.jobId, user, response);
      return { handled: true };
    }]
  ]);

  const server = http.createServer(async (request, response) => {
    applyCors(request, response, allowedOrigin);
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const { pathname } = new URL(request.url, 'http://localhost');

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
      const result = await route.handler({ request, response, params: route.params, user });
      if (result?.handled) return;
      if (result?.status) sendJson(response, result.status, result.body);
      else sendJson(response, 200, result);
    } catch (error) {
      if (!(error instanceof HttpError)) log({ event: 'http:error', method: request.method, path: pathname, message: error.message });
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
