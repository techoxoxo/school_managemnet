import { AppError, ErrorCodes } from '@schoolmate/shared';
import { z } from 'zod';

/** Standard list query params (Plan §7 pagination/sort). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function paginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Throws the standard 404 envelope when a record is missing/invisible. */
export function assertFound<T>(row: T | undefined, entity: string): asserts row is T {
  if (row === undefined) {
    throw new AppError(ErrorCodes.NOT_FOUND, `${entity} not found`, 404);
  }
}

/** UUID path-param schema shared by every :id route. */
export const idParamSchema = z.object({ id: z.string().uuid() });
