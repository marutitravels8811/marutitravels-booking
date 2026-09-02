// Server-side only. Not marked `server-only` so scripts can seed agents.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agent, auditLog, passwordReset } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

/** Minutes a forgotten-password request stays open for a colleague to approve. */
export const RESET_REQUEST_TTL_MINUTES = 60;

/**
 * A one-time password that can be read aloud without ambiguity.
 *
 * No 0/O, 1/l/I or 5/S, and grouped in fours, because this gets dictated across
 * a counter or over the phone. Length keeps roughly 62 bits of entropy, which
 * is ample for something that must be changed at first use.
 */
export function generateTempPassword(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ23467989";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export interface AgentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  bookingsMade: number;
}

export async function listAgents(): Promise<AgentRow[]> {
  const rows = await db
    .select({
      id: agent.id, name: agent.name, email: agent.email, phone: agent.phone,
      isActive: agent.isActive, mustChangePassword: agent.mustChangePassword,
      lastLoginAt: agent.lastLoginAt, createdAt: agent.createdAt,
      bookingsMade: sql<number>`(
        select count(*)::int from booking b where b.created_by_agent_id = ${agent.id}
      )`,
    })
    .from(agent)
    .orderBy(desc(agent.isActive), agent.name);

  return rows.map((r) => ({
    ...r,
    lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt) : null,
    createdAt: new Date(r.createdAt),
  }));
}

export async function createAgent(p: {
  name: string; email: string; phone?: string | null;
  actorAgentId: string; ip?: string | null; userAgent?: string | null;
}): Promise<{ agentId: string; tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const email = p.email.trim().toLowerCase();

  const agentId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(agent).values({
      name: p.name.trim(),
      email,
      phone: p.phone?.trim() || null,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      createdBy: p.actorAgentId,
    }).returning();

    await writeAudit(tx, {
      agentId: p.actorAgentId, action: "AGENT_CREATED",
      entityType: "agent", entityId: created.id,
      after: { name: created.name, email: created.email, phone: created.phone },
      ip: p.ip, userAgent: p.userAgent,
    });
    return created.id;
  });

  return { agentId, tempPassword };
}

export async function updateAgent(p: {
  agentId: string; name: string; email: string; phone?: string | null;
  actorAgentId: string; ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(agent)
      .where(eq(agent.id, p.agentId)).limit(1);
    if (!before) throw new AppError("AGENT_NOT_FOUND", "That agent no longer exists.");

    await tx.update(agent).set({
      name: p.name.trim(),
      email: p.email.trim().toLowerCase(),
      phone: p.phone?.trim() || null,
      updatedAt: sql`now()`,
    }).where(eq(agent.id, p.agentId));

    await writeAudit(tx, {
      agentId: p.actorAgentId, action: "AGENT_UPDATED",
      entityType: "agent", entityId: p.agentId,
      before: { name: before.name, email: before.email, phone: before.phone },
      after: { name: p.name, email: p.email, phone: p.phone },
      ip: p.ip, userAgent: p.userAgent,
    });
  });
}

/**
 * Deactivating is the only way to remove an agent.
 *
 * Bookings carry `created_by_agent_id` forever, so deleting the row would
 * either break that link or erase who made a sale. The last active account
 * cannot be deactivated — that would lock everyone out with no way back in.
 */
export async function setAgentActive(p: {
  agentId: string; isActive: boolean; actorAgentId: string;
  ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(agent)
      .where(eq(agent.id, p.agentId)).limit(1);
    if (!target) throw new AppError("AGENT_NOT_FOUND", "That agent no longer exists.");
    if (target.isActive === p.isActive) return;

    if (!p.isActive) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` })
        .from(agent).where(eq(agent.isActive, true));
      if (n <= 1) {
        throw new AppError("LAST_AGENT",
          "This is the only active account. Add another agent before deactivating this one, or nobody will be able to sign in.");
      }
    }

    await tx.update(agent).set({ isActive: p.isActive, updatedAt: sql`now()` })
      .where(eq(agent.id, p.agentId));

    await writeAudit(tx, {
      agentId: p.actorAgentId,
      action: p.isActive ? "AGENT_REACTIVATED" : "AGENT_DEACTIVATED",
      entityType: "agent", entityId: p.agentId,
      before: { isActive: target.isActive },
      after: { isActive: p.isActive },
      ip: p.ip, userAgent: p.userAgent,
    });
  });
}

/** Issue a one-time password. Returned once, never stored in the clear. */
export async function issueTempPassword(p: {
  agentId: string; actorAgentId: string; resetId?: string | null;
  ip?: string | null; userAgent?: string | null;
}): Promise<{ tempPassword: string; agentName: string; agentEmail: string }> {
  const tempPassword = generateTempPassword();

  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(agent)
      .where(eq(agent.id, p.agentId)).limit(1);
    if (!target) throw new AppError("AGENT_NOT_FOUND", "That agent no longer exists.");

    await tx.update(agent).set({
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      updatedAt: sql`now()`,
    }).where(eq(agent.id, p.agentId));

    if (p.resetId) {
      await tx.update(passwordReset).set({
        status: "COMPLETED",
        approvedBy: p.actorAgentId,
        approvedAt: sql`now()`,
      }).where(eq(passwordReset.id, p.resetId));
    }
    // clear any other queued request so the list does not keep showing it
    await tx.update(passwordReset).set({ status: "CANCELLED" })
      .where(and(
        eq(passwordReset.agentId, p.agentId),
        eq(passwordReset.status, "PENDING"),
      ));

    await writeAudit(tx, {
      agentId: p.actorAgentId, action: "PASSWORD_RESET_ISSUED",
      entityType: "agent", entityId: p.agentId,
      after: { forAgent: target.email, viaRequest: p.resetId ?? null },
      ip: p.ip, userAgent: p.userAgent,
    });

    return { tempPassword, agentName: target.name, agentEmail: target.email };
  });
}

/** An agent changing their own password. Requires the current one. */
export async function changeOwnPassword(p: {
  agentId: string; currentPassword: string; newPassword: string;
  ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  if (p.newPassword.length < 8) {
    throw new AppError("WEAK_PASSWORD",
      "Use at least 8 characters.", "newPassword");
  }
  if (p.newPassword === p.currentPassword) {
    throw new AppError("SAME_PASSWORD",
      "The new password must be different from the current one.", "newPassword");
  }

  await db.transaction(async (tx) => {
    const [me] = await tx.select().from(agent)
      .where(eq(agent.id, p.agentId)).limit(1);
    if (!me) throw new AppError("AGENT_NOT_FOUND", "Your account no longer exists.");

    if (!(await verifyPassword(p.currentPassword, me.passwordHash))) {
      throw new AppError("WRONG_PASSWORD",
        "That is not your current password.", "currentPassword");
    }

    await tx.update(agent).set({
      passwordHash: await hashPassword(p.newPassword),
      mustChangePassword: false,
      updatedAt: sql`now()`,
    }).where(eq(agent.id, p.agentId));

    await writeAudit(tx, {
      agentId: p.agentId, action: "PASSWORD_CHANGED",
      entityType: "agent", entityId: p.agentId,
      ip: p.ip, userAgent: p.userAgent,
    });
  });
}

/* ─────────────────── forgotten passwords ─────────────────── */

export interface PendingReset {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  requestedAt: Date;
  expiresAt: Date;
}

/**
 * Record that someone cannot sign in.
 *
 * Always reports success to the caller regardless of whether the email matched
 * an account: telling an unauthenticated visitor "no such agent" would confirm
 * which addresses exist.
 */
export async function requestPasswordReset(p: {
  email: string; ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  const email = p.email.trim().toLowerCase();
  const [target] = await db.select().from(agent)
    .where(eq(agent.email, email)).limit(1);
  if (!target || !target.isActive) return;

  await db.transaction(async (tx) => {
    // one open request per agent; asking twice just refreshes the clock
    await tx.update(passwordReset).set({ status: "CANCELLED" })
      .where(and(
        eq(passwordReset.agentId, target.id),
        eq(passwordReset.status, "PENDING"),
      ));

    await tx.insert(passwordReset).values({
      agentId: target.id,
      requestedIp: p.ip ?? null,
      expiresAt: sql`now() + ${`${RESET_REQUEST_TTL_MINUTES} minutes`}::interval`,
    });

    await writeAudit(tx, {
      agentId: null, action: "PASSWORD_RESET_REQUESTED",
      entityType: "agent", entityId: target.id,
      after: { email },
      ip: p.ip, userAgent: p.userAgent,
    });
  });
}

export async function listPendingResets(): Promise<PendingReset[]> {
  // expire on read, so a stale request never looks actionable
  await db.update(passwordReset).set({ status: "EXPIRED" })
    .where(and(
      eq(passwordReset.status, "PENDING"),
      sql`${passwordReset.expiresAt} < now()`,
    ));

  const rows = await db
    .select({
      id: passwordReset.id,
      agentId: passwordReset.agentId,
      agentName: agent.name,
      agentEmail: agent.email,
      requestedAt: passwordReset.requestedAt,
      expiresAt: passwordReset.expiresAt,
    })
    .from(passwordReset)
    .innerJoin(agent, eq(agent.id, passwordReset.agentId))
    .where(eq(passwordReset.status, "PENDING"))
    .orderBy(desc(passwordReset.requestedAt));

  return rows.map((r) => ({
    ...r,
    requestedAt: new Date(r.requestedAt),
    expiresAt: new Date(r.expiresAt),
  }));
}

export async function dismissReset(p: {
  resetId: string; actorAgentId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(passwordReset).set({ status: "CANCELLED" })
      .where(eq(passwordReset.id, p.resetId));
    await writeAudit(tx, {
      agentId: p.actorAgentId, action: "PASSWORD_RESET_DISMISSED",
      entityType: "password_reset", entityId: p.resetId,
    });
  });
}

/** Recent security-relevant events for one agent, for the detail panel. */
export async function agentActivity(agentId: string, limit = 12) {
  return db.select({
    action: auditLog.action,
    createdAt: auditLog.createdAt,
    ip: auditLog.ip,
  }).from(auditLog)
    .where(and(
      eq(auditLog.entityType, "agent"),
      eq(auditLog.entityId, agentId),
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
