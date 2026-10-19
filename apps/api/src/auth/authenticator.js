const crypto = require('node:crypto');
const { HttpError } = require('../http');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function header(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

// AUTH_MODE=proxy trusts identities only when they carry the shared secret added by
// the public Next.js service. The API itself stays on Railway's private network.
function createAuthenticator({ users, mode = process.env.AUTH_MODE, devUser = {} }) {
  let devUserPromise = null;

  return async function authenticate(headers = {}) {
    if (mode === 'dev') {
      devUserPromise = devUserPromise || users.upsertBySubject({
        subject: `dev:${devUser.email || 'dev@previley.local'}`,
        email: devUser.email || 'dev@previley.local',
        displayName: devUser.name || 'Usuario de desarrollo'
      }).catch((error) => {
        devUserPromise = null;
        throw error;
      });
      return { ...(await devUserPromise), role: 'admin' };
    }
    if (mode === 'proxy') {
      const secret = process.env.PROXY_AUTH_SECRET;
      if (!secret || !safeEqual(header(headers, 'x-transformador-auth'), secret)) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Las credenciales internas no son válidas.');
      }
      const role = header(headers, 'x-transformador-role');
      const email = header(headers, 'x-transformador-email');
      const displayName = header(headers, 'x-transformador-name');
      if (!['admin', 'user'].includes(role) || !email) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'La identidad interna está incompleta.');
      }
      return {
        ...(await users.upsertBySubject({ subject: `proxy:${role}:${email}`, email, displayName: displayName || email })),
        role
      };
    }
    throw new HttpError(401, 'UNAUTHENTICATED', 'Inicia sesión con Previley SSO para continuar.');
  };
}

function requireAdmin(user) {
  if (user?.role !== 'admin') {
    throw new HttpError(403, 'ADMIN_REQUIRED', 'Solo el administrador puede gestionar plantillas.');
  }
}

module.exports = { createAuthenticator, requireAdmin };
