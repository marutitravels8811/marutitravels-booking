// Server-side only. Not marked `server-only` so seeding scripts and the
// concurrency test harness can call these services directly under tsx;
// they import the pg driver, which cannot be bundled for the client anyway.
import type { Tx, DB } from "@/db";

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

/** Compatibility shim while legacy audit persistence is removed. */
export async function writeAudit(tx: Tx | DB, e: AuditEntry): Promise<void> {
  void tx;
  void e;
}
