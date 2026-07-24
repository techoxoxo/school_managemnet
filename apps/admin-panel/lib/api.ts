import 'server-only';
import type { ApiResponse } from '@schoolmate/shared';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Server-side platform API client: forwards the httpOnly super-admin token. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const token = (await cookies()).get('platform_token')?.value;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}
