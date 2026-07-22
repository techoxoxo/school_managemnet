import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * BFF login (P0-WEB-02): browser → this handler → Fastify. Tokens land in
 * httpOnly cookies so client JS can never read them.
 */
export async function POST(request: NextRequest) {
  const { slug, email, password } = (await request.json()) as {
    slug?: string;
    email: string;
    password: string;
  };

  const tenantSlug = slug || request.cookies.get('tenant_slug')?.value;
  if (!tenantSlug) {
    return NextResponse.json(
      { success: false, error: { code: 'TENANT_NOT_FOUND', message: 'School not specified' } },
      { status: 400 },
    );
  }

  const apiRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-slug': tenantSlug },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const body = await apiRes.json();

  const res = NextResponse.json(body, { status: apiRes.status });
  if (apiRes.status === 200 && body.success) {
    const secure = process.env.NODE_ENV === 'production';
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
    res.cookies.set('tenant_slug', tenantSlug, {
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 3600,
    });
    // Client-side hint only (nav rendering); never used for authorization.
    delete body.data.accessToken;
    delete body.data.refreshToken;
  }
  return res;
}
