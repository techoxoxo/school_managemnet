import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Rotates the refresh token and reissues the access cookie (P0-WEB-02). */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const tenantSlug = request.cookies.get('tenant_slug')?.value;
  if (!refreshToken || !tenantSlug) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const apiRes = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-slug': tenantSlug },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  const body = await apiRes.json();

  if (apiRes.status !== 200 || !body.success) {
    const res = NextResponse.json({ success: false }, { status: 401 });
    res.cookies.delete('access_token');
    res.cookies.delete('refresh_token');
    return res;
  }

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({ success: true });
  res.cookies.set('access_token', body.data.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 900,
  });
  res.cookies.set('refresh_token', body.data.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
