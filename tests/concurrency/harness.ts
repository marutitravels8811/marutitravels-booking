import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import {
  agent, booking, bookingSeat, bus, route, seat, seatHold, trip, tripSeatState,
  payment, scheduleTemplate, seatLayout,
} from "../../src/db/schema";
import { hashPassword } from "../../src/lib/password";
import { generateStandardLayout } from "../../src/lib/seat-layout";
import { saveLayoutVersion } from "../../src/server/services/layout";
import { createTrip } from "../../src/server/services/trip";

/**
 * This suite truncates every table between tests, so it must never be pointed
 * at a database that holds real bookings. The guard is deliberately awkward to
 * satisfy: an accidental run against the office's live Neon database would
 * destroy the booking history, and no test result is worth that risk.
 */
export function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set.");

  const dbName = (url.split("/").pop() ?? "").split("?")[0].toLowerCase();
  const looksDisposable = /(^|[_-])(test|ci|scratch|dev)([_-]|$)/.test(dbName);
  const overridden = process.env.ALLOW_DESTRUCTIVE_TESTS === "yes-wipe-this-database";

  if (!looksDisposable && !overridden) {
    throw new Error(
      `Refusing to run destructive tests against "${dbName}".\n` +
      `This suite deletes every row in every table.\n\n` +
      `Point DATABASE_URL at a database whose name contains test, ci, scratch ` +
      `or dev — or, if you are certain, set\n` +
      `  ALLOW_DESTRUCTIVE_TESTS=yes-wipe-this-database`,
    );
  }
}

export interface Fixture {
  agentIds: string[];
  tripId: string;
  seatIds: string[];
  seatNumbers: string[];
}

/** A clean bus, trip and set of agents for one test. */
export async function makeFixture(agentCount = 4): Promise<Fixture> {
  const stamp = (process.hrtime()[1] + Math.floor(Math.random() * 1e6)).toString(36);
  const hash = await hashPassword("test1234");

  const agents = await db.insert(agent).values(
    Array.from({ length: agentCount }, (_, i) => ({
      name: `Agent ${i + 1}`,
      email: `a${i}-${stamp}@test.local`,
      passwordHash: hash,
    })),
  ).returning({ id: agent.id });

  const [r] = await db.insert(route).values({
    code: `T${stamp}`.slice(0, 12), origin: "A", destination: "B",
  }).returning();

  const tripId = await db.transaction(async (tx) => {
    const [b] = await tx.insert(bus).values({
      registrationNo: `TEST ${stamp}`,
      displayName: `Test bus ${stamp}`,
      fareSingleSofaPaise: 90000,
      fareDoubleSofaPaise: 80000,
      fareCabinPaise: 120000,
    }).returning();

    await saveLayoutVersion(tx, {
      busId: b.id, draft: generateStandardLayout(),
      agentId: agents[0].id, baseLayoutId: null,
    });

    const { tripId } = await createTrip(tx, {
      routeId: r.id, direction: "ONWARD", busId: b.id,
      serviceDate: "2030-01-15", departureTime: "21:00", arrivalTime: "07:00",
      timeZone: "Asia/Kolkata", agentId: agents[0].id,
    });
    return tripId;
  });

  const seats = await db
    .select({ id: seat.id, seatNumber: seat.seatNumber })
    .from(tripSeatState)
    .innerJoin(seat, eq(seat.id, tripSeatState.seatId))
    .where(eq(tripSeatState.tripId, tripId))
    .orderBy(seat.sortOrder);

  return {
    agentIds: agents.map((a) => a.id),
    tripId,
    seatIds: seats.map((s) => s.id),
    seatNumbers: seats.map((s) => s.seatNumber),
  };
}

/** Every seat on a trip, by raw stored status. */
export async function seatCounts(tripId: string) {
  const rows = await db.select({
    status: tripSeatState.status,
    n: sql<number>`count(*)::int`,
  }).from(tripSeatState)
    .where(eq(tripSeatState.tripId, tripId))
    .groupBy(tripSeatState.status);
  const out: Record<string, number> = {
    AVAILABLE: 0, HELD: 0, BOOKED: 0, BLOCKED: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/**
 * The invariant that matters: no berth may carry both a live hold and a
 * booking, and no two bookings may share a berth on the same trip.
 */
export async function findDoubleSells(tripId: string) {
  const { rows } = await db.execute<{ seat_id: string; problem: string }>(sql`
    select s.seat_id,
           case
             when s.status = 'BOOKED' and s.hold_id is not null then 'booked_with_live_hold'
             when s.status = 'BOOKED' and s.booking_id is null  then 'booked_without_booking'
             when s.status = 'HELD'   and s.booking_id is not null then 'held_with_booking'
             when s.status = 'HELD'   and s.hold_id is null     then 'held_without_hold'
           end as problem
    from ${tripSeatState} s
    where s.trip_id = ${tripId}
      and ( (s.status = 'BOOKED' and (s.hold_id is not null or s.booking_id is null))
         or (s.status = 'HELD'   and (s.booking_id is not null or s.hold_id is null)) )
  `);
  return rows;
}

/** A seat sold on two different bookings would show up here. */
export async function findSeatsOnMultipleBookings(tripId: string) {
  const { rows } = await db.execute<{ seat_id: string; n: number }>(sql`
    select bs.seat_id, count(*)::int as n
    from ${bookingSeat} bs
    join ${booking} b on b.id = bs.booking_id
    where b.trip_id = ${tripId} and b.status <> 'CANCELLED'
    group by bs.seat_id
    having count(*) > 1
  `);
  return rows;
}

export async function cleanup() {
  // children first; most tables cascade, but payment does not
  await db.delete(payment);
  await db.delete(bookingSeat);
  // status must drop to AVAILABLE in the same statement: the held_needs_hold
  // and booked_needs_booking constraints reject a HELD or BOOKED row with no
  // owner, which is exactly the protection being relied on in production.
  await db.execute(sql`update ${tripSeatState}
    set status = 'AVAILABLE', booking_id = null, hold_id = null, held_until = null`);
  await db.delete(booking);
  await db.delete(seatHold);
  await db.delete(tripSeatState);
  await db.delete(trip);
  await db.delete(scheduleTemplate);  // references bus, so it must go first
  await db.delete(seat);
  await db.execute(sql`update ${bus} set current_layout_id = null`);
  await db.delete(seatLayout);
  await db.delete(bus);
  await db.delete(route);
  await db.delete(agent);
}

export async function shutdown() { await pool.end(); }

/* ── tiny assertion helpers, so the suite has no test-runner dependency ── */

let passed = 0, failed = 0;
const failures: string[] = [];

export function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

export function heading(s: string) {
  console.log(`\n\x1b[1m${s}\x1b[0m`);
}

export function report(): number {
  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m`);
  for (const f of failures) console.log(`  · ${f}`);
  return failed === 0 ? 0 : 1;
}
