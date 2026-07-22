import { NextResponse, type NextRequest } from 'next/server';

/**
 * Tenant-aware routing + auth guard (P0-WEB-03).
 *
 * - Resolves the tenant slug from the subdomain (springfield.<domain>) when
 *   present and pins it into a cookie so the BFF handlers can forward it.
 * - Guards the app group: no access-token cookie → redirect to /login.
 * - Keeps authenticated users out of /login.
 *
 * Authorization still happens server-side in the API (RLS + permission guard);
 * this is only UX routing. A present cookie is not treated as proof of a valid
 * session — the API re-verifies every request.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

function tenantFromHost(host: string): string | null {
  const name = host.split(':')[0] ?? '';
  // e.g. springfield.localhost or springfield.schoolmate.app
  const parts = name.split('.');
  if (name.endsWith('.localhost') && parts.length >= 2) return parts[0] ?? null;
  if (parts.length >= 3) return parts[0] ?? null;
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('access_token'));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const res =
    !hasSession && !isPublic
      ? NextResponse.redirect(new URL('/login', request.url))
      : hasSession && pathname === '/login'
        ? NextResponse.redirect(new URL('/dashboard', request.url))
        : NextResponse.next();

  // Pin subdomain tenant into a cookie the BFF + API can read.
  const slug = tenantFromHost(request.headers.get('host') ?? '');
  if (slug && request.cookies.get('tenant_slug')?.value !== slug) {
    res.cookies.set('tenant_slug', slug, { sameSite: 'lax', path: '/' });
  }
  return res;
}

export const config = {
  // Everything except Next internals, the BFF API routes, and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
