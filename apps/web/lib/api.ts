import 'server-only';
import type { ApiResponse } from '@schoolmate/shared';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Server-side API client (P0-WEB-05): forwards the auth cookie as a Bearer
 * token and the tenant slug header. Full OpenAPI codegen replaces the manual
 * generics once the API surface grows (P1).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const jar = await cookies();
  const token = jar.get('access_token')?.value;
  const slug = jar.get('tenant_slug')?.value;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(slug ? { 'x-tenant-slug': slug } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

export interface SessionUser {
  userId: string;
  tenantId: string;
  role: string;
  branchId: string | null;
  permissions: string[];
}

/** Current session from the API, or null when not authenticated. */
export async function getSession(): Promise<SessionUser | null> {
  const { status, body } = await apiFetch<SessionUser>('/auth/me');
  if (status !== 200 || !body.success) return null;
  return body.data;
}
