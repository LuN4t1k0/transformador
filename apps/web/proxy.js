import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  VISITOR_COOKIE_NAME,
  createVisitorCookie,
  privateCookieOptions,
  readVisitorCookie,
  safeEqual
} from './lib/server/access.js';

const IDENTITY_HEADERS = [
  'x-transformador-auth',
  'x-transformador-email',
  'x-transformador-name',
  'x-transformador-role'
];

export function proxy(request) {
  const secret = process.env.PROXY_AUTH_SECRET;
  const adminToken = process.env.ADMIN_SESSION_TOKEN;

  // Local development keeps using AUTH_MODE=dev. Production fails closed if its
  // private web-to-API secret or admin-session token has not been configured.
  if (process.env.NODE_ENV !== 'production' && (!secret || !adminToken)) {
    return NextResponse.next();
  }
  if (!secret || !adminToken) {
    return new NextResponse('Configuración de acceso incompleta', { status: 503 });
  }

  const existingVisitor = readVisitorCookie(request.cookies.get(VISITOR_COOKIE_NAME)?.value, secret);
  const visitor = existingVisitor ? { id: existingVisitor, value: null } : createVisitorCookie(secret);
  const isAdmin = safeEqual(request.cookies.get(ADMIN_COOKIE_NAME)?.value, adminToken);
  const identity = isAdmin
    ? { email: 'admin@previley.local', name: 'Cristian', role: 'admin' }
    : { email: `visitor-${visitor.id}@transformador.local`, name: 'Usuario', role: 'user' };

  const headers = new Headers(request.headers);
  for (const name of IDENTITY_HEADERS) headers.delete(name);
  headers.set('x-transformador-auth', secret);
  headers.set('x-transformador-email', identity.email);
  headers.set('x-transformador-name', identity.name);
  headers.set('x-transformador-role', identity.role);

  const response = NextResponse.next({ request: { headers } });
  if (visitor.value) {
    response.cookies.set(VISITOR_COOKIE_NAME, visitor.value, privateCookieOptions(60 * 60 * 24 * 365));
  }
  return response;
}

export const config = {
  matcher: ['/((?!health|_next/static|_next/image|favicon.ico).*)']
};
