import { outboxEvents } from './schema/messaging.js';
import type { TenantDb } from './tenant-db.js';

export interface EmitEventParams {
  tenantId: string;
  type: string;
  aggregateType: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Transactional outbox write (Plan §17). Call INSIDE a request.tenantDb()
 * transaction alongside the state change — the event commits atomically with
 * it, so a rollback drops the event and a commit guarantees it. The worker
 * relay dispatches it asynchronously.
 */
export async function emitEvent(db: TenantDb, params: EmitEventParams): Promise<void> {
  await db.insert(outboxEvents).values({
    tenantId: params.tenantId,
    eventType: params.type,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId ?? null,
    payload: (params.payload ?? {}) as never,
  });
}
