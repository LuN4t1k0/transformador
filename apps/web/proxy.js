import { NextResponse } from 'next/server';

export function proxy(request) {
  const username = process.env.APP_ACCESS_USERNAME;
  const password = process.env.APP_ACCESS_PASSWORD;

  // Keep local development unchanged. Production refuses to start without the
  // credentials being configured in Railway, so both values are expected there.
  if (!username || !password) return NextResponse.next();

  const expected = `Basic ${btoa(`${username}:${password}`)}`;
  if (request.headers.get('authorization') === expected) return NextResponse.next();

  return new NextResponse('Autenticación requerida', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Transformador Previley", charset="UTF-8"' }
  });
}

export const config = {
  matcher: ['/((?!health|_next/static|_next/image|favicon.ico).*)']
};
