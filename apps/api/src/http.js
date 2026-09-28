class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_JSON_BYTES = 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof HttpError ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  sendJson(response, status, { error: { code, message } });
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'El cuerpo de la solicitud no es JSON válido.');
  }
}

function applyCors(request, response, allowedOrigin) {
  const origin = request.headers.origin;
  if (origin && origin === allowedOrigin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-expose-headers', 'content-disposition, x-request-id');
    response.setHeader('vary', 'origin');
  }
}

// Minimal router: routes are [method, pattern, handler] with :params.
function createRouter(routes) {
  const compiled = routes.map(([method, pattern, handler]) => {
    const names = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    })}$`);
    return { method, regex, names, handler };
  });

  return function match(method, pathname) {
    let pathMatched = false;
    for (const route of compiled) {
      const result = route.regex.exec(pathname);
      if (!result) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(result[index + 1])]));
      return { handler: route.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  };
}

module.exports = { HttpError, sendJson, sendError, readJson, applyCors, createRouter };
