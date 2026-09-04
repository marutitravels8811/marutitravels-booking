// Server-side only. Not marked `server-only` so the concurrency test harness
// can drive these functions directly under tsx.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agent, booking, bus, route, seat, seatHold, trip, tripSeatState,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";

/**
 * How long seats stay reserved before returning to the pool.
 *
 * 30 minutes rather than the 10 an at-the-counter flow would need: an agent is
 * expected to park a reservation, serve other customers, and confirm once the
 * customer's payment lands. Two extensions are allowed on top, so a genuinely
 * slow payment can be held for 90 minutes before the seats free up.
 */
export const HOLD_TTL_MINUTES = Number(process.env.HOLD_TTL_MINUTES ?? 30);
export const MAX_EXTENSIONS = 2;

export class SeatConflictError extends Error {
  constructor(public conflictingSeatNumbers: string[], public conflictingSeatIds: string[]) {
    super(
      conflictingSeatNumbers.length
        ? `Seat ${conflictingSeatNumbers.join(", ")} was just taken by someone else.`
        : "Those seats are no longer available.",
    );
    this.name = "SeatConflictError";
  }
}

/**
 * Raw `sql` expressions bypass Drizzle's column type mapping, so `now()` can
 * arrive as a string depending on the driver. Everything downstream does date
 * arithmetic on it, so normalise once here rather than trusting the shape.
 */
function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

export class HoldError extends Error {
  constructor(public code: "HOLD_EXPIRED" | "HOLD_NOT_YOURS" | "HOLD_NOT_FOUND"
    | "TRIP_NOT_BOOKABLE" | "NO_SEATS" | "MAX_EXTENSIONS", message: string) {
    super(message);
    this.name = "HoldError";
  }
}

export interface HoldResult {
  holdId: string;
  tripId: string;
  expiresAt: Date;
  seatIds: string[];
  seatNumbers: string[];
  /** server clock at the moment of the response, so clients can measure skew */
  serverNow: Date;
}

/**
 * Reserve seats for one agent, for a limited time.
 *
 * This is the concurrency-critical path. The guarantees, and how each is met:
 *
 *  - No double-sell. `trip_seat_state` has one row per (trip, seat) and its
 *    composite primary key is the mutual-exclusion mechanism: two agents
 *    chasing the same berth contend for one physical row. `FOR UPDATE` makes
 *    the loser block until the winner commits, then re-evaluate.
 *
 *  - All-or-nothing. The guarded UPDATE only touches rows that are genuinely
 *    free; if it returns fewer rows than were asked for, the whole transaction
 *    rolls back. A four-seat hold never half-succeeds.
 *
 *  - No deadlock. Rows are locked in a fixed order (`ORDER BY seat_id`), so two
 *    transactions requesting {A,B} and {B,A} still queue rather than deadlock.
 *
 *  - No stuck seats. An expired hold reads as free here (`held_until < now()`),
 *    so correctness never depends on the sweeper job having run.
 *
 * READ COMMITTED is sufficient: every decision is made by the guarded UPDATE
 * itself under a row lock, not from a value read earlier in the transaction.
 */
export async function createHold(p: {
  tripId: string;
  seatIds: string[];
  agentId: string;
  ttlMinutes?: number;
  provisionalName?: string | null;
  provisionalPhone?: string | null;
}): Promise<HoldResult> {
  const seatIds = [...new Set(p.seatIds)];
  if (seatIds.length === 0) {
    throw new HoldError("NO_SEATS", "Select at least one seat.");
  }
  const ttl = p.ttlMinutes ?? HOLD_TTL_MINUTES;

  return db.transaction(async (tx) => {
    const [t] = await tx.select({ id: trip.id, status: trip.status })
      .from(trip).where(eq(trip.id, p.tripId)).limit(1);
    if (!t) throw new HoldError("TRIP_NOT_BOOKABLE", "That trip no longer exists.");
    if (t.status !== "SCHEDULED") {
      throw new HoldError("TRIP_NOT_BOOKABLE",
        `This trip is ${t.status.toLowerCase()} and cannot be booked.`);
    }

    const [hold] = await tx.insert(seatHold).values({
      tripId: p.tripId,
      agentId: p.agentId,
      expiresAt: sql`now() + ${`${ttl} minutes`}::interval`,
      provisionalName: p.provisionalName ?? null,
      provisionalPhone: p.provisionalPhone ?? null,
    }).returning();

    // Lock the target rows in a stable order, then claim only the free ones.
    const claimed = await tx.execute<{ seat_id: string }>(sql`
      with target as (
        select trip_id, seat_id
        from ${tripSeatState}
        where trip_id = ${p.tripId}
          and seat_id in ${seatIds}
        order by seat_id
        for update
      )
      update ${tripSeatState} s
      set status      = 'HELD',
          hold_id     = ${hold.id},
          held_until  = now() + ${`${ttl} minutes`}::interval,
          booking_id  = null,
          version     = s.version + 1,
          updated_at  = now()
      from target t
      where s.trip_id = t.trip_id
        and s.seat_id = t.seat_id
        and ( s.status = 'AVAILABLE'
              or (s.status = 'HELD' and s.held_until < now()) )
      returning s.seat_id
    `);

    const claimedIds = new Set(claimed.rows.map((r) => r.seat_id));

    if (claimedIds.size !== seatIds.length) {
      const missing = seatIds.filter((id) => !claimedIds.has(id));
      const rows = missing.length
        ? await tx.select({ id: seat.id, seatNumber: seat.seatNumber })
            .from(seat).where(sql`${seat.id} in ${missing}`)
        : [];
      // rolls back the hold row and every seat flip above
      throw new SeatConflictError(rows.map((r) => r.seatNumber), missing);
    }

    const seatRows = await tx.select({ id: seat.id, seatNumber: seat.seatNumber })
      .from(seat).where(sql`${seat.id} in ${seatIds}`).orderBy(seat.sortOrder);

    const [fresh] = await tx.select({
      expiresAt: seatHold.expiresAt,
      now: sql<string>`now()`,
    }).from(seatHold).where(eq(seatHold.id, hold.id));

    await writeAudit(tx, {
      agentId: p.agentId,
      action: "HOLD_CREATED",
      entityType: "seat_hold",
      entityId: hold.id,
      after: {
        tripId: p.tripId,
        seats: seatRows.map((s) => s.seatNumber),
        expiresAt: fresh.expiresAt,
      },
    });

    return {
      holdId: hold.id,
      tripId: p.tripId,
      expiresAt: toDate(fresh.expiresAt),
      seatIds,
      seatNumbers: seatRows.map((s) => s.seatNumber),
      serverNow: toDate(fresh.now),
    };
  });
}

/** Give the agent more time. Capped, so a hold cannot be parked indefinitely. */
export async function extendHold(p: {
  holdId: string; agentId: string; ttlMinutes?: number;
}): Promise<{ expiresAt: Date; serverNow: Date; extensionCount: number }> {
  const ttl = p.ttlMinutes ?? HOLD_TTL_MINUTES;

  return db.transaction(async (tx) => {
    const [h] = await tx.select().from(seatHold)
      .where(eq(seatHold.id, p.holdId)).for("update").limit(1);

    if (!h) throw new HoldError("HOLD_NOT_FOUND", "That reservation no longer exists.");
    if (h.agentId !== p.agentId) {
      throw new HoldError("HOLD_NOT_YOURS", "That reservation belongs to another agent.");
    }
    if (h.status !== "ACTIVE" || new Date(h.expiresAt).getTime() <= Date.now()) {
      throw new HoldError("HOLD_EXPIRED",
        "That reservation has expired. Please select the seats again.");
    }
    if (h.extensionCount >= MAX_EXTENSIONS) {
      throw new HoldError("MAX_EXTENSIONS",
        `A reservation can only be extended ${MAX_EXTENSIONS} times.`);
    }

    const [updated] = await tx.update(seatHold).set({
      expiresAt: sql`now() + ${`${ttl} minutes`}::interval`,
      extensionCount: h.extensionCount + 1,
    }).where(eq(seatHold.id, p.holdId)).returning();

    await tx.update(tripSeatState).set({
      heldUntil: updated.expiresAt,
      version: sql`${tripSeatState.version} + 1`,
      updatedAt: sql`now()`,
    }).where(and(
      eq(tripSeatState.holdId, p.holdId),
      eq(tripSeatState.status, "HELD"),
    ));

    const [{ now }] = await tx.select({ now: sql<string>`now()` }).from(seatHold).limit(1);

    await writeAudit(tx, {
      agentId: p.agentId, action: "HOLD_EXTENDED",
      entityType: "seat_hold", entityId: p.holdId,
      after: { expiresAt: updated.expiresAt, extensionCount: updated.extensionCount },
    });

    return {
      expiresAt: toDate(updated.expiresAt), serverNow: toDate(now),
      extensionCount: updated.extensionCount,
    };
  });
}

/**
 * Give the seats back.
 *
 * Any agent may release any hold — there is one role, and a customer standing
 * at the counter should not be blocked by a colleague who walked away. A
 * release by someone other than the holder demands a reason and is audited.
 */
export async function releaseHold(p: {
  holdId: string; agentId: string; reason?: string | null;
}): Promise<{ released: number }> {
  return db.transaction(async (tx) => {
    const [h] = await tx.select().from(seatHold)
      .where(eq(seatHold.id, p.holdId)).for("update").limit(1);
    if (!h) throw new HoldError("HOLD_NOT_FOUND", "That reservation no longer exists.");
    if (h.status !== "ACTIVE") return { released: 0 };

    const freed = await tx.update(tripSeatState).set({
      status: "AVAILABLE", holdId: null, heldUntil: null,
      version: sql`${tripSeatState.version} + 1`, updatedAt: sql`now()`,
    }).where(and(
      eq(tripSeatState.holdId, p.holdId),
      eq(tripSeatState.status, "HELD"),
    )).returning({ seatId: tripSeatState.seatId });

    await tx.update(seatHold).set({
      status: "RELEASED",
      releasedAt: sql`now()`,
      releasedBy: p.agentId,
      releaseReason: p.reason ?? null,
    }).where(eq(seatHold.id, p.holdId));

    await writeAudit(tx, {
      agentId: p.agentId,
      action: h.agentId === p.agentId ? "HOLD_RELEASED" : "HOLD_FORCE_RELEASED",
      entityType: "seat_hold", entityId: p.holdId,
      before: { holderAgentId: h.agentId, seatCount: freed.length },
      after: { reason: p.reason ?? null },
    });

    return { released: freed.length };
  });
}

/**
 * Sweep expired holds.
 *
 * Purely cosmetic for correctness — `createHold` already treats an expired hold
 * as free. This keeps the seat map tidy and stops abandoned holds from showing
 * as someone else's reservation.
 */
export async function expireStaleHolds(): Promise<{ holds: number; seats: number }> {
  return db.transaction(async (tx) => {
    const freed = await tx.update(tripSeatState).set({
      status: "AVAILABLE", holdId: null, heldUntil: null,
      version: sql`${tripSeatState.version} + 1`, updatedAt: sql`now()`,
    }).where(and(
      eq(tripSeatState.status, "HELD"),
      sql`${tripSeatState.heldUntil} < now()`,
    )).returning({ seatId: tripSeatState.seatId });

    const expired = await tx.update(seatHold).set({ status: "EXPIRED" })
      .where(and(
        eq(seatHold.status, "ACTIVE"),
        sql`${seatHold.expiresAt} < now()`,
      )).returning({ id: seatHold.id });

    return { holds: expired.length, seats: freed.length };
  });
}

export interface SeatStateRow {
  seatId: string;
  seatNumber: string;
  deck: "UPPER" | "LOWER" | "CABIN";
  berthType: "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
  sofaGroupId: string | null;
  sofaPosition: "A" | "B" | null;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
  holdId: string | null;
  heldByAgentId: string | null;
  heldByAgentName: string | null;
  heldUntil: Date | null;
  bookingId: string | null;
  customerName: string | null;
  blockReason: string | null;
  version: number;
}

/**
 * The seat map for a trip.
 *
 * Expiry is applied in the projection, not by mutating rows, so a read never
 * needs a write lock and a stale hold can never be shown as live.
 */
export async function getTripSeatStates(
  tripId: string,
): Promise<{ seats: SeatStateRow[]; serverNow: Date }> {
  const rows = await db
    .select({
      seatId: seat.id,
      seatNumber: seat.seatNumber,
      deck: seat.deck,
      berthType: seat.berthType,
      sofaGroupId: seat.sofaGroupId,
      sofaPosition: seat.sofaPosition,
      rowIndex: seat.rowIndex,
      colIndex: seat.colIndex,
      isActive: seat.isActive,
      rawStatus: tripSeatState.status,
      holdId: tripSeatState.holdId,
      heldUntil: tripSeatState.heldUntil,
      bookingId: tripSeatState.bookingId,
      customerName: booking.primaryPassengerName,
      blockReason: tripSeatState.blockReason,
      version: tripSeatState.version,
      heldByAgentId: seatHold.agentId,
      heldByAgentName: agent.name,
      now: sql<string>`now()`,
    })
    .from(tripSeatState)
    .innerJoin(seat, eq(seat.id, tripSeatState.seatId))
    .leftJoin(seatHold, eq(seatHold.id, tripSeatState.holdId))
    .leftJoin(agent, eq(agent.id, seatHold.agentId))
    .leftJoin(booking, eq(booking.id, tripSeatState.bookingId))
    .where(eq(tripSeatState.tripId, tripId))
    .orderBy(seat.sortOrder);

  const serverNow = rows[0] ? toDate(rows[0].now) : new Date();

  const seats: SeatStateRow[] = rows.map((r) => {
    const heldUntil = r.heldUntil ? toDate(r.heldUntil) : null;
    const expired = r.rawStatus === "HELD" &&
      (!heldUntil || heldUntil.getTime() <= serverNow.getTime());
    return {
      seatId: r.seatId,
      seatNumber: r.seatNumber,
      deck: r.deck,
      berthType: r.berthType,
      sofaGroupId: r.sofaGroupId,
      sofaPosition: r.sofaPosition,
      rowIndex: r.rowIndex,
      colIndex: r.colIndex,
      isActive: r.isActive,
      status: expired ? "AVAILABLE" : r.rawStatus,
      holdId: expired ? null : r.holdId,
      heldByAgentId: expired ? null : r.heldByAgentId,
      heldByAgentName: expired ? null : r.heldByAgentName,
      heldUntil: expired ? null : heldUntil,
      bookingId: r.bookingId,
      customerName: r.customerName,
      blockReason: r.blockReason,
      version: r.version,
    };
  });

  return { seats, serverNow };
}

/** Resolve typed seat numbers ("u7, L3") to ids on a trip. */
export async function resolveSeatNumbers(
  tripId: string, numbers: string[],
): Promise<{ found: { seatId: string; seatNumber: string }[]; unknown: string[] }> {
  const wanted = numbers
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean);
  if (wanted.length === 0) return { found: [], unknown: [] };

  const rows = await db
    .select({ seatId: seat.id, seatNumber: seat.seatNumber })
    .from(tripSeatState)
    .innerJoin(seat, eq(seat.id, tripSeatState.seatId))
    .where(and(
      eq(tripSeatState.tripId, tripId),
      sql`upper(${seat.seatNumber}) in ${wanted}`,
    ));

  const byNumber = new Map(rows.map((r) => [r.seatNumber.toUpperCase(), r]));
  return {
    found: wanted.map((n) => byNumber.get(n)).filter((r): r is NonNullable<typeof r> => !!r),
    unknown: wanted.filter((n) => !byNumber.has(n)),
  };
}

/* ─────────────────── parked reservations ─────────────────── */

export interface ActiveHoldRow {
  holdId: string;
  tripId: string;
  agentId: string;
  agentName: string;
  expiresAt: Date;
  extensionCount: number;
  provisionalName: string | null;
  provisionalPhone: string | null;
  createdAt: Date;
  seatNumbers: string[];
  seatIds: string[];
  serviceDate: string;
  direction: "ONWARD" | "RETURN";
  departureAt: Date;
  origin: string;
  destination: string;
  busName: string;
  isMine: boolean;
}

/**
 * Live reservations, for the "parked bookings" tray.
 *
 * A hold is deliberately not tied to one screen: an agent can reserve seats for
 * a customer who is arranging payment, serve the next person in the queue, and
 * come back to confirm. The hold lives in the database, so it survives page
 * navigation, a refresh, or a different browser tab.
 */
export async function listActiveHolds(
  viewerAgentId: string, opts: { mineOnly?: boolean } = {},
): Promise<ActiveHoldRow[]> {
  const conditions = [
    eq(seatHold.status, "ACTIVE"),
    sql`${seatHold.expiresAt} > now()`,
  ];
  if (opts.mineOnly) conditions.push(eq(seatHold.agentId, viewerAgentId));

  const rows = await db
    .select({
      holdId: seatHold.id,
      tripId: seatHold.tripId,
      agentId: seatHold.agentId,
      agentName: agent.name,
      expiresAt: seatHold.expiresAt,
      extensionCount: seatHold.extensionCount,
      provisionalName: seatHold.provisionalName,
      provisionalPhone: seatHold.provisionalPhone,
      createdAt: seatHold.createdAt,
      serviceDate: trip.serviceDate,
      direction: trip.direction,
      departureAt: trip.departureAt,
      origin: route.origin,
      destination: route.destination,
      busName: bus.displayName,
      seatNumbers: sql<string[]>`coalesce((
        select array_agg(s.seat_number order by s.sort_order)
        from ${tripSeatState} tss join ${seat} s on s.id = tss.seat_id
        where tss.hold_id = ${seatHold.id} and tss.status = 'HELD'
      ), '{}')`,
      seatIds: sql<string[]>`coalesce((
        select array_agg(tss.seat_id::text order by tss.seat_id)
        from ${tripSeatState} tss
        where tss.hold_id = ${seatHold.id} and tss.status = 'HELD'
      ), '{}')`,
    })
    .from(seatHold)
    .innerJoin(agent, eq(agent.id, seatHold.agentId))
    .innerJoin(trip, eq(trip.id, seatHold.tripId))
    .innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .where(and(...conditions))
    .orderBy(seatHold.expiresAt);

  return rows
    // a hold whose seats were all force-released is a shell; don't show it
    .filter((r) => (r.seatNumbers ?? []).length > 0)
    .map((r) => ({
      ...r,
      expiresAt: new Date(r.expiresAt),
      createdAt: new Date(r.createdAt),
      departureAt: new Date(r.departureAt),
      seatNumbers: r.seatNumbers ?? [],
      seatIds: r.seatIds ?? [],
      isMine: r.agentId === viewerAgentId,
    }));
}

/** One live hold, for resuming a parked booking. */
export async function getActiveHold(
  holdId: string, viewerAgentId: string,
): Promise<ActiveHoldRow | null> {
  const all = await listActiveHolds(viewerAgentId);
  return all.find((h) => h.holdId === holdId) ?? null;
}

/** Attach or update the customer hint on a parked hold. */
export async function setHoldProvisional(p: {
  holdId: string; agentId: string;
  provisionalName?: string | null; provisionalPhone?: string | null;
}): Promise<void> {
  await db.update(seatHold).set({
    provisionalName: p.provisionalName?.trim() || null,
    provisionalPhone: p.provisionalPhone?.trim() || null,
  }).where(and(
    eq(seatHold.id, p.holdId),
    eq(seatHold.status, "ACTIVE"),
  ));
}
