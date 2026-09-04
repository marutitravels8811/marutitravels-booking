// Server-side only. Not marked `server-only` so scripts and the concurrency
// test harness can call these services directly under tsx.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  bus, route, scheduleTemplate, seat, seatLayout, trip, tripSeatState,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";

export class TripError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** Combine an office-local `YYYY-MM-DD` and `HH:MM` into a real instant. */
export function localDateTimeToUtc(
  serviceDate: string, timeHHMM: string, timeZone: string,
): Date {
  const [h, m] = timeHHMM.split(":").map(Number);
  // Start from the naive UTC reading, then correct by the zone's offset at
  // that moment. Two passes settle DST boundaries; India has none, but this
  // keeps the helper correct if the office ever moves.
  let guess = new Date(`${serviceDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 2; i++) {
    const asLocal = new Date(guess.toLocaleString("en-US", { timeZone }));
    const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
    guess = new Date(guess.getTime() + (asUtc.getTime() - asLocal.getTime()));
  }
  return guess;
}

export function addDays(serviceDate: string, days: number): string {
  const d = new Date(`${serviceDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(serviceDate: string): number {
  return new Date(`${serviceDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

/**
 * Create one trip and seed its seat inventory.
 *
 * The `trip_seat_state` rows are inserted in the *same transaction* as the trip
 * itself. A trip must never exist without a complete set of seat rows — the
 * hold logic locks those rows, and a missing row would read as "seat does not
 * exist on this trip" rather than as a conflict.
 */
export async function createTrip(
  tx: Tx,
  p: {
    routeId: string;
    direction: "ONWARD" | "RETURN";
    busId: string;
    serviceDate: string;
    departureTime: string;  // HH:MM, office-local
    arrivalTime: string;    // HH:MM, office-local
    timeZone: string;
    templateId?: string | null;
    agentId: string;
  },
): Promise<{ tripId: string; seatCount: number }> {
  const [b] = await tx.select().from(bus).where(eq(bus.id, p.busId)).limit(1);
  if (!b) throw new TripError("BUS_NOT_FOUND", "That bus does not exist.");
  if (!b.currentLayoutId) {
    throw new TripError("BUS_HAS_NO_LAYOUT",
      `${b.displayName} has no seat layout yet. Set up its seating first.`);
  }

  const seats = await tx.select({ id: seat.id }).from(seat)
    .where(and(eq(seat.layoutId, b.currentLayoutId), eq(seat.isActive, true)));
  if (seats.length === 0) {
    throw new TripError("LAYOUT_EMPTY",
      `${b.displayName}'s layout has no active berths.`);
  }

  const departureAt = localDateTimeToUtc(p.serviceDate, p.departureTime, p.timeZone);
  let arrivalAt = localDateTimeToUtc(p.serviceDate, p.arrivalTime, p.timeZone);
  // an arrival earlier than departure means the bus lands the next morning
  if (arrivalAt <= departureAt) arrivalAt = new Date(arrivalAt.getTime() + 86_400_000);

  const [t] = await tx.insert(trip).values({
    routeId: p.routeId,
    direction: p.direction,
    busId: p.busId,
    layoutId: b.currentLayoutId,
    serviceDate: p.serviceDate,
    departureAt,
    arrivalAt,
    templateId: p.templateId ?? null,
    totalSeats: seats.length,
    createdBy: p.agentId,
  }).returning();

  // freeze the layout: from here on, edits create a new version instead
  await tx.update(seatLayout).set({ isFrozen: true })
    .where(eq(seatLayout.id, b.currentLayoutId));

  await tx.insert(tripSeatState).values(
    seats.map((s) => ({ tripId: t.id, seatId: s.id })),
  );

  await writeAudit(tx, {
    agentId: p.agentId,
    action: "TRIP_CREATED",
    entityType: "trip",
    entityId: t.id,
    after: {
      serviceDate: p.serviceDate, direction: p.direction,
      busId: p.busId, seatCount: seats.length,
    },
  });

  return { tripId: t.id, seatCount: seats.length };
}

/**
 * Materialise trips from active schedule templates across a date range.
 *
 * Idempotent: the `(bus_id, service_date, direction)` unique index means a
 * re-run cannot create duplicates, and existing trips are skipped rather than
 * treated as errors.
 */
export async function generateTrips(
  p: { fromDate: string; toDate: string; timeZone: string; agentId: string;
       templateIds?: string[] },
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const templates = await db.select().from(scheduleTemplate).where(
    p.templateIds?.length
      ? and(eq(scheduleTemplate.isActive, true),
            inArray(scheduleTemplate.id, p.templateIds))
      : eq(scheduleTemplate.isActive, true),
  );

  let created = 0, skipped = 0;
  const errors: string[] = [];

  for (let d = p.fromDate; d <= p.toDate; d = addDays(d, 1)) {
    const dow = dayOfWeek(d);
    for (const t of templates) {
      if (!t.daysOfWeek.includes(dow)) continue;
      if (t.validFrom && new Date(`${d}T23:59:59Z`) < t.validFrom) continue;
      if (t.validTo && new Date(`${d}T00:00:00Z`) > t.validTo) continue;

      const [existing] = await db.select({ id: trip.id }).from(trip).where(and(
        eq(trip.busId, t.busId), eq(trip.serviceDate, d),
        eq(trip.direction, t.direction),
      )).limit(1);
      if (existing) { skipped++; continue; }

      try {
        await db.transaction(async (tx) => {
          await createTrip(tx, {
            routeId: t.routeId, direction: t.direction, busId: t.busId,
            serviceDate: d, departureTime: t.departureTime,
            arrivalTime: t.arrivalTime, timeZone: p.timeZone,
            templateId: t.id, agentId: p.agentId,
          });
        });
        created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // a concurrent generator won the race for this slot — not an error
        if (msg.includes("trip_bus_date_dir_uq")) { skipped++; continue; }
        errors.push(`${d} · ${t.direction}: ${msg}`);
      }
    }
  }
  return { created, skipped, errors };
}

export interface TripListRow {
  id: string;
  serviceDate: string;
  direction: "ONWARD" | "RETURN";
  departureAt: Date;
  arrivalAt: Date;
  status: "SCHEDULED" | "DEPARTED" | "CANCELLED" | "COMPLETED";
  totalSeats: number;
  busName: string;
  registrationNo: string;
  routeCode: string;
  origin: string;
  destination: string;
  available: number;
  held: number;
  booked: number;
}

/** Trips on a date, with live availability. Expired holds already read as free. */
export async function listTripsForDate(
  serviceDate: string, routeId?: string,
): Promise<TripListRow[]> {
  const rows = await db
    .select({
      id: trip.id,
      serviceDate: trip.serviceDate,
      direction: trip.direction,
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
      status: trip.status,
      totalSeats: trip.totalSeats,
      busName: bus.displayName,
      registrationNo: bus.registrationNo,
      routeCode: route.code,
      origin: route.origin,
      destination: route.destination,
      available: sql<number>`(
        select count(*)::int from ${tripSeatState} s
        where s.trip_id = ${trip.id}
          and (s.status = 'AVAILABLE'
               or (s.status = 'HELD' and s.held_until < now()))
      )`,
      held: sql<number>`(
        select count(*)::int from ${tripSeatState} s
        where s.trip_id = ${trip.id}
          and s.status = 'HELD' and s.held_until >= now()
      )`,
      booked: sql<number>`(
        select count(*)::int from ${tripSeatState} s
        where s.trip_id = ${trip.id} and s.status = 'BOOKED'
      )`,
    })
    .from(trip)
    .innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(route, eq(route.id, trip.routeId))
    .where(routeId
      ? and(eq(trip.serviceDate, serviceDate), eq(trip.routeId, routeId),
        eq(trip.status, "SCHEDULED"), eq(bus.isActive, true), eq(route.isActive, true))
      : and(eq(trip.serviceDate, serviceDate), eq(trip.status, "SCHEDULED"),
        eq(bus.isActive, true), eq(route.isActive, true)))
    .orderBy(trip.departureAt, bus.displayName);

  return rows as TripListRow[];
}
