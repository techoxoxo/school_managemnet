import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  const tenantSlug = request.cookies.get('tenant_slug')?.value;

  if (token && tenantSlug) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'x-tenant-slug': tenantSlug, authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.delete('access_token');
  res.cookies.delete('refresh_token');
  return res;
}
