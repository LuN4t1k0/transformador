const test = require('node:test');
const assert = require('node:assert/strict');

test('anonymous browser identities are signed and reject tampering', async () => {
  const { createVisitorCookie, readVisitorCookie } = await import('../apps/web/lib/server/access.js');
  const secret = 'a-private-proxy-secret';
  const visitor = createVisitorCookie(secret);

  assert.equal(readVisitorCookie(visitor.value, secret), visitor.id);
  assert.equal(readVisitorCookie(visitor.value, 'another-secret'), null);
  assert.equal(readVisitorCookie(visitor.value.replace(visitor.id[0], visitor.id[0] === 'a' ? 'b' : 'a'), secret), null);
});

test('constant-time comparison accepts only the exact admin credential', async () => {
  const { safeEqual } = await import('../apps/web/lib/server/access.js');

  assert.equal(safeEqual('admin-key', 'admin-key'), true);
  assert.equal(safeEqual('admin-key', 'admin-keY'), false);
  assert.equal(safeEqual('short', 'a-much-longer-value'), false);
});
