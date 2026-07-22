import { auditLogs, type TenantDb } from '@schoolmate/db';
import type { AuthContext } from '../plugins/auth.js';

export interface AuditEntry {
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
}

/**
 * DoD: audit logging on all writes. Called inside the same tenant transaction
 * as the mutation, so the audit row is atomic with the change (Plan §13 L6).
 */
export async function writeAudit(
  db: TenantDb,
  auth: AuthContext,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: auth.tenantId,
    userId: auth.userId,
    userRole: auth.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValues: (entry.oldValues ?? null) as never,
    newValues: (entry.newValues ?? null) as never,
  });
}
