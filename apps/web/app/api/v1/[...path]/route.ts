import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Authenticated BFF proxy: browser → here → Fastify /v1/*. Forwards the
 * httpOnly access token as a Bearer and the tenant slug header, so client
 * components can call the API for mutations without ever seeing the token.
 * Authorization is still enforced server-side (RLS + permission guard).
 */
async function forward(request: NextRequest, path: string[]) {
  const token = request.cookies.get('access_token')?.value;
  const slug = request.cookies.get('tenant_slug')?.value;
  const url = `${API_URL}/v1/${path.join('/')}${request.nextUrl.search}`;
  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';

  const apiRes = await fetch(url, {
    method: request.method,
    headers: {
      // Only send content-type with an actual body — Fastify rejects an empty
      // application/json body (e.g. bodyless DELETE).
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(slug ? { 'x-tenant-slug': slug } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(hasBody ? { body: await request.text() } : {}),
    cache: 'no-store',
  });
  return new NextResponse(await apiRes.text(), {
    status: apiRes.status,
    headers: { 'content-type': 'application/json' },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
