const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticator, requireAdmin } = require('../apps/api/src/auth/authenticator');

function users() {
  return {
    async upsertBySubject(identity) {
      return { id: 'user-id', ...identity };
    }
  };
}

test('proxy authentication accepts a signed admin identity', async () => {
  const previous = process.env.PROXY_AUTH_SECRET;
  process.env.PROXY_AUTH_SECRET = 'private-secret';
  try {
    const authenticate = createAuthenticator({ users: users(), mode: 'proxy' });
    const user = await authenticate({
      'x-transformador-auth': 'private-secret',
      'x-transformador-email': 'admin@previley.cl',
      'x-transformador-name': 'Cristian',
      'x-transformador-role': 'admin'
    });
    assert.equal(user.role, 'admin');
    assert.equal(user.subject, 'proxy:admin:admin@previley.cl');
  } finally {
    if (previous === undefined) delete process.env.PROXY_AUTH_SECRET;
    else process.env.PROXY_AUTH_SECRET = previous;
  }
});

test('proxy authentication rejects forged or incomplete identities', async () => {
  const previous = process.env.PROXY_AUTH_SECRET;
  process.env.PROXY_AUTH_SECRET = 'private-secret';
  try {
    const authenticate = createAuthenticator({ users: users(), mode: 'proxy' });
    await assert.rejects(() => authenticate({
      'x-transformador-auth': 'wrong',
      'x-transformador-email': 'user@previley.cl',
      'x-transformador-role': 'admin'
    }), (error) => error.status === 401 && error.code === 'UNAUTHENTICATED');
  } finally {
    if (previous === undefined) delete process.env.PROXY_AUTH_SECRET;
    else process.env.PROXY_AUTH_SECRET = previous;
  }
});

test('template management requires the admin role', () => {
  assert.doesNotThrow(() => requireAdmin({ role: 'admin' }));
  assert.throws(() => requireAdmin({ role: 'user' }), (error) => error.status === 403 && error.code === 'ADMIN_REQUIRED');
});
