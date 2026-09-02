// Server-side only. Not marked `server-only` so seeding scripts and the
// concurrency test harness can call these services directly under tsx;
// they import the pg driver, which cannot be bundled for the client anyway.
import type { Tx, DB } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  agentId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Always pass the surrounding transaction. Writing the audit row on a separate
 * connection would let the audit and the change it describes disagree.
 */
export async function writeAudit(tx: Tx | DB, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    agentId: e.agentId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    beforeJson: (e.before ?? null) as never,
    afterJson: (e.after ?? null) as never,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
  });
}
