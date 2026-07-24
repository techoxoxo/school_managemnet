import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** BFF platform login: browser → here → Fastify /auth/platform-login. */
export async function POST(request: NextRequest) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const apiRes = await fetch(`${API_URL}/auth/platform-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const body = await apiRes.json();

  const res = NextResponse.json(body, { status: apiRes.status });
  if (apiRes.status === 200 && body.success) {
    res.cookies.set('platform_token', body.data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });
    delete body.data.accessToken;
    delete body.data.refreshToken;
  }
  return res;
}
