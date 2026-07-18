import type { ErrorCode } from './errors.js';

/** Standard success envelope (Plan §7). */
export interface ApiSuccess<T, M = unknown> {
  success: true;
  data: T;
  meta?: M;
}

/** Standard error envelope (Plan §7). */
export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

export type ApiResponse<T, M = unknown> = ApiSuccess<T, M> | ApiError;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type Paginated<T> = ApiSuccess<T[], PaginationMeta>;
