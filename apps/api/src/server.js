const http = require('node:http');
const net = require('node:net');
const { URL } = require('node:url');
const { config } = require('../../../packages/shared/src/config');
const { JOB_STATUSES } = require('../../../packages/shared/src/job-statuses');
const { QUEUE_NAMES } = require('../../../packages/queue/src');

const port = Number(process.env.PORT || 4000);

function checkTcp(urlValue) {
  return new Promise((resolve) => {
    if (!urlValue) {
      resolve({ ok: false, reason: 'missing_url' });
      return;
    }

    const parsed = new URL(urlValue);
    const socket = net.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port)
    });

    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve({ ok: true });
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ ok: false, reason: 'timeout' });
    });
    socket.once('error', (error) => {
      resolve({ ok: false, reason: error.code || error.message });
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    const [postgres, redis] = await Promise.all([
      checkTcp(process.env.DATABASE_URL),
      checkTcp(process.env.REDIS_URL)
    ]);

    sendJson(response, postgres.ok && redis.ok ? 200 : 503, {
      status: postgres.ok && redis.ok ? 'ok' : 'degraded',
      service: 'previley-excel-transformer-api',
      dependencies: { postgres, redis }
    });
    return;
  }

  if (request.method === 'GET' && request.url === '/config') {
    sendJson(response, 200, {
      config,
      queues: QUEUE_NAMES,
      jobStatuses: JOB_STATUSES
    });
    return;
  }

  sendJson(response, 404, {
    error: 'not_found',
    routes: ['/health', '/config']
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});
