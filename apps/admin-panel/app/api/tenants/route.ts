import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** BFF create-tenant: forwards to the platform API with the super-admin token. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('platform_token')?.value;
  const payload = await request.json();
  const apiRes = await fetch(`${API_URL}/platform/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  return NextResponse.json(await apiRes.json(), { status: apiRes.status });
}
