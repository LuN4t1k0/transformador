import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, privateCookieOptions } from '../../../lib/server/access.js';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(ADMIN_COOKIE_NAME, '', privateCookieOptions(0));
  return response;
}
