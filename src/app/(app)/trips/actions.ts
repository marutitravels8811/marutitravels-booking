"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { scheduleTemplate, trip } from "@/db/schema";
import { requireSession, requestMeta } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { adHocTripSchema, generateTripsSchema, scheduleTemplateSchema } from "@/lib/schemas";
import { createTrip, generateTrips, TripError } from "@/server/services/trip";
import { OFFICE_TZ } from "@/lib/time";

export interface ActionResult<T = unknown> {
  ok: boolean; data?: T; error?: string; fieldErrors?: Record<string, string>;
}

function zodFail(e: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.map(String).join(".");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { ok: false as const, error: e.issues[0]?.message, fieldErrors };
}

export async function createAdHocTripAction(raw: unknown): Promise<ActionResult<{ tripId: string }>> {
  const session = await requireSession();
  const parsed = adHocTripSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;

  try {
    const result = await db.transaction((tx) => createTrip(tx, {
      routeId: v.routeId, direction: v.direction, busId: v.busId,
      serviceDate: v.serviceDate, departureTime: v.departureTime,
      arrivalTime: v.arrivalTime, timeZone: OFFICE_TZ, agentId: session.agentId,
    }));
    revalidatePath("/trips");
    return { ok: true, data: { tripId: result.tripId } };
  } catch (e) {
    if (e instanceof TripError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (msg.includes("trip_bus_date_dir_uq")) {
      return { ok: false,
        error: "That bus already has a trip in this direction on that date." };
    }
    return { ok: false, error: msg };
  }
}

export async function generateTripsAction(
  raw: unknown,
): Promise<ActionResult<{ created: number; skipped: number; errors: string[] }>> {
  const session = await requireSession();
  const parsed = generateTripsSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);

  const result = await generateTrips({
    ...parsed.data, timeZone: OFFICE_TZ, agentId: session.agentId,
  });

  await writeAudit(db, {
    agentId: session.agentId, action: "TRIPS_GENERATED",
    entityType: "trip", entityId: null,
    after: { ...parsed.data, ...result }, ...(await requestMeta()),
  });

  revalidatePath("/trips");
  return { ok: true, data: result };
}

export async function saveScheduleTemplateAction(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = scheduleTemplateSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const values = {
        routeId: v.routeId, busId: v.busId, direction: v.direction,
        departureTime: v.departureTime, arrivalTime: v.arrivalTime,
        daysOfWeek: v.daysOfWeek, isActive: v.isActive,
        validFrom: new Date(`${v.validFrom}T00:00:00Z`),
        validTo: v.validTo ? new Date(`${v.validTo}T23:59:59Z`) : null,
      };
      if (v.id) {
        await tx.update(scheduleTemplate).set(values)
          .where(eq(scheduleTemplate.id, v.id));
      } else {
        await tx.insert(scheduleTemplate).values(values);
      }
      await writeAudit(tx, {
        agentId: session.agentId,
        action: v.id ? "SCHEDULE_UPDATED" : "SCHEDULE_CREATED",
        entityType: "schedule_template", entityId: v.id ?? null, after: v,
      });
    });
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function cancelTripAction(
  tripId: string, reason: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!reason.trim()) return { ok: false, error: "Give a reason for cancelling." };

  try {
    await db.transaction(async (tx) => {
      const [t] = await tx.select().from(trip).where(eq(trip.id, tripId)).limit(1);
      if (!t) throw new Error("That trip no longer exists.");
      await tx.update(trip).set({ status: "CANCELLED" }).where(eq(trip.id, tripId));
      await writeAudit(tx, {
        agentId: session.agentId, action: "TRIP_CANCELLED",
        entityType: "trip", entityId: tripId,
        before: { status: t.status }, after: { reason: reason.trim() },
      });
    });
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not cancel" };
  }
}
