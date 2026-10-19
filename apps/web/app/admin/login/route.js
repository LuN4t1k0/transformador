import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, privateCookieOptions, safeEqual } from '../../../lib/server/access.js';

export async function POST(request) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionToken = process.env.ADMIN_SESSION_TOKEN;
  if (!adminUsername || !adminPassword || !sessionToken) {
    return NextResponse.json(
      { error: { code: 'ADMIN_NOT_CONFIGURED', message: 'El acceso de administrador no está configurado.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const body = await request.json().catch(() => null);
  const credentialsAreStrings = typeof body?.username === 'string' && typeof body?.password === 'string';
  const credentialsAreBounded = credentialsAreStrings && body.username.length <= 256 && body.password.length <= 1024;
  const credentialsAreValid = credentialsAreBounded
    && safeEqual(body.username, adminUsername)
    && safeEqual(body.password, adminPassword);
  if (!credentialsAreValid) {
    return NextResponse.json(
      { error: { code: 'INVALID_ADMIN_CREDENTIALS', message: 'El usuario o la contraseña no son válidos.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(ADMIN_COOKIE_NAME, sessionToken, privateCookieOptions(60 * 60 * 8));
  return response;
}
