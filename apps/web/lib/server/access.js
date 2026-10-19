import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'transformador_admin';
export const VISITOR_COOKIE_NAME = 'transformador_visitor';

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function visitorSignature(id, secret) {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

export function createVisitorCookie(secret) {
  const id = randomUUID();
  return { id, value: `${id}.${visitorSignature(id, secret)}` };
}

export function readVisitorCookie(value, secret) {
  const separator = String(value || '').lastIndexOf('.');
  if (separator < 0) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  return safeEqual(signature, visitorSignature(id, secret)) ? id : null;
}

export function privateCookieOptions(maxAge) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  };
}
