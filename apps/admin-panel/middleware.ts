import { NextResponse, type NextRequest } from 'next/server';

/** Auth guard: no platform token → /login; authenticated → keep out of /login. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('platform_token'));
  const isLogin = pathname === '/login';

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL('/tenants', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
