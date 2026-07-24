import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** BFF: trigger auto-scaffold onboarding for a tenant. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = request.cookies.get('platform_token')?.value;
  const body = await request.json().catch(() => ({}));
  const apiRes = await fetch(`${API_URL}/platform/tenants/${id}/onboard`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return NextResponse.json(await apiRes.json(), { status: apiRes.status });
}
