// Server-side only. Not marked `server-only` so scripts can seed schedules.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bus, route, scheduleTemplate, trip } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduleRow {
  id: string;
  routeId: string;
  routeCode: string;
  origin: string;
  destination: string;
  busId: string;
  busName: string;
  registrationNo: string;
  direction: "ONWARD" | "RETURN";
  departureTime: string;
  arrivalTime: string;
  daysOfWeek: number[];
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  futureTripCount: number;
  /** trips already generated from this schedule */
  tripsGenerated: number;
  /** the last date a trip exists for, so gaps are visible */
  lastGeneratedDate: string | null;
}

export async function listSchedules(): Promise<ScheduleRow[]> {
  const rows = await db
    .select({
      id: scheduleTemplate.id,
      routeId: scheduleTemplate.routeId,
      routeCode: route.code,
      origin: route.origin,
      destination: route.destination,
      busId: scheduleTemplate.busId,
      busName: bus.displayName,
      registrationNo: bus.registrationNo,
      direction: scheduleTemplate.direction,
      departureTime: scheduleTemplate.departureTime,
      arrivalTime: scheduleTemplate.arrivalTime,
      daysOfWeek: scheduleTemplate.daysOfWeek,
      validFrom: scheduleTemplate.validFrom,
      validTo: scheduleTemplate.validTo,
      isActive: scheduleTemplate.isActive,
      futureTripCount: sql<number>`(
        select count(*)::int from ${trip} t where t.template_id = ${scheduleTemplate.id}
          and t.status = 'SCHEDULED' and t.service_date >= to_char(current_date, 'YYYY-MM-DD')
      )`,
      tripsGenerated: sql<number>`(
        select count(*)::int from ${trip} t where t.template_id = ${scheduleTemplate.id}
      )`,
      lastGeneratedDate: sql<string | null>`(
        select max(t.service_date) from ${trip} t
        where t.template_id = ${scheduleTemplate.id} and t.status <> 'CANCELLED'
      )`,
    })
    .from(scheduleTemplate)
    .innerJoin(route, eq(route.id, scheduleTemplate.routeId))
    .innerJoin(bus, eq(bus.id, scheduleTemplate.busId))
    .where(and(eq(scheduleTemplate.isActive, true), eq(route.isActive, true), eq(bus.isActive, true)))
    .orderBy(route.code,
             scheduleTemplate.departureTime);

  return rows.map((r) => ({
    ...r,
    daysOfWeek: [...(r.daysOfWeek ?? [])].sort((a, b) => a - b),
    validFrom: new Date(r.validFrom),
    validTo: r.validTo ? new Date(r.validTo) : null,
  }));
}

export interface SaveScheduleInput {
  id?: string;
  routeId: string;
  busId: string;
  direction: "ONWARD" | "RETURN";
  departureTime: string;
  arrivalTime: string;
  daysOfWeek: number[];
  validFrom: string;
  validTo?: string | null;
  isActive: boolean;
  actorAgentId: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Create or update a schedule.
 *
 * Editing a schedule changes only what is generated *from now on* — trips
 * already materialised keep the times they were created with, because tickets
 * have been printed against them. Changing a departure time therefore needs the
 * affected trips edited or cancelled separately, which the screen says plainly.
 */
export async function saveSchedule(p: SaveScheduleInput): Promise<string> {
  if (p.daysOfWeek.length === 0) {
    throw new AppError("NO_DAYS", "Pick at least one day of the week.", "daysOfWeek");
  }
  if (p.validTo && p.validTo < p.validFrom) {
    throw new AppError("BAD_RANGE",
      "The end date cannot be before the start date.", "validTo");
  }

  return db.transaction(async (tx) => {
    // a bus cannot leave twice in the same direction on the same day
    const clash = await tx
      .select({ id: scheduleTemplate.id, departureTime: scheduleTemplate.departureTime })
      .from(scheduleTemplate)
      .where(and(
        eq(scheduleTemplate.busId, p.busId),
        eq(scheduleTemplate.direction, p.direction),
        eq(scheduleTemplate.isActive, true),
      ));

    const overlapping = clash.filter((c) => c.id !== p.id);
    if (overlapping.length > 0 && p.isActive) {
      const [existing] = await tx.select({ days: scheduleTemplate.daysOfWeek })
        .from(scheduleTemplate)
        .where(eq(scheduleTemplate.id, overlapping[0].id)).limit(1);
      const sharedDays = (existing?.days ?? []).filter((d) => p.daysOfWeek.includes(d));
      if (sharedDays.length > 0) {
        throw new AppError("SCHEDULE_CLASH",
          `That bus already has ${p.direction === "ONWARD" ? "an onward" : "a return"} schedule on ` +
          `${sharedDays.map((d) => DAY_NAMES[d]).join(", ")}. A bus can only make one ` +
          `trip per direction per day — use a different bus, or change the days.`);
      }
    }

    const values = {
      routeId: p.routeId,
      busId: p.busId,
      direction: p.direction,
      departureTime: p.departureTime,
      arrivalTime: p.arrivalTime,
      daysOfWeek: p.daysOfWeek,
      isActive: p.isActive,
      validFrom: new Date(`${p.validFrom}T00:00:00Z`),
      validTo: p.validTo ? new Date(`${p.validTo}T23:59:59Z`) : null,
    };

    let id = p.id;
    let before: unknown = null;

    if (id) {
      const [existing] = await tx.select().from(scheduleTemplate)
        .where(eq(scheduleTemplate.id, id)).limit(1);
      if (!existing) {
        throw new AppError("SCHEDULE_NOT_FOUND", "That schedule no longer exists.");
      }
      before = existing;
      await tx.update(scheduleTemplate).set(values)
        .where(eq(scheduleTemplate.id, id));
    } else {
      const [created] = await tx.insert(scheduleTemplate).values(values).returning();
      id = created.id;
    }

    await writeAudit(tx, {
      agentId: p.actorAgentId,
      action: p.id ? "SCHEDULE_UPDATED" : "SCHEDULE_CREATED",
      entityType: "schedule_template",
      entityId: id,
      before,
      after: values,
      ip: p.ip, userAgent: p.userAgent,
    });

    return id!;
  });
}

/**
 * Retire a schedule.
 *
 * Deactivated rather than deleted: generated trips point back at it, and those
 * trips carry bookings. Turning it off stops future generation without
 * disturbing anything already sold.
 */
export async function setScheduleActive(p: {
  scheduleId: string; isActive: boolean; actorAgentId: string;
  ip?: string | null; userAgent?: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(scheduleTemplate)
      .where(eq(scheduleTemplate.id, p.scheduleId)).limit(1);
    if (!existing) {
      throw new AppError("SCHEDULE_NOT_FOUND", "That schedule no longer exists.");
    }

    await tx.update(scheduleTemplate).set({ isActive: p.isActive })
      .where(eq(scheduleTemplate.id, p.scheduleId));

    await writeAudit(tx, {
      agentId: p.actorAgentId,
      action: p.isActive ? "SCHEDULE_REACTIVATED" : "SCHEDULE_DEACTIVATED",
      entityType: "schedule_template", entityId: p.scheduleId,
      before: { isActive: existing.isActive },
      after: { isActive: p.isActive },
      ip: p.ip, userAgent: p.userAgent,
    });
  });
}

/** Future trips from a schedule that have no bookings — safe to remove. */
export async function countRemovableFutureTrips(
  scheduleId: string, fromDate: string,
): Promise<{ total: number; withBookings: number }> {
  const [row] = await db.execute<{ total: number; with_bookings: number }>(sql`
    select
      count(*)::int as total,
      count(*) filter (
        where exists (
          select 1 from booking b
          where b.trip_id = t.id and b.status <> 'CANCELLED'
        )
      )::int as with_bookings
    from ${trip} t
    where t.template_id = ${scheduleId}
      and t.service_date >= ${fromDate}
      and t.status = 'SCHEDULED'
  `).then((r) => r.rows);

  return { total: row?.total ?? 0, withBookings: row?.with_bookings ?? 0 };
}
