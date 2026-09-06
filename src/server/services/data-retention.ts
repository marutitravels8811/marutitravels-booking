import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  booking, dataRetentionSetting, idempotencyKey, seatHold, trip,
} from "@/db/schema";
import { AppError } from "@/server/errors";

export const RETENTION_CATEGORIES = [
  "bookings",
  "expiredHolds",
  "completedTrips",
  "idempotencyKeys",
] as const;

export type RetentionCategory = typeof RETENTION_CATEGORIES[number];

export interface RetentionSelection {
  bookings: boolean;
  expiredHolds: boolean;
  completedTrips: boolean;
  idempotencyKeys: boolean;
}

export interface RetentionSettings extends RetentionSelection {
  enabled: boolean;
  retentionDays: number;
  frequency: "DAILY" | "WEEKLY";
  lastRunAt: Date | null;
}

const OLD_BOOKING_STATUSES = ["CANCELLED", "NO_SHOW", "COMPLETED"] as const;
const OLD_TRIP_STATUSES = ["CANCELLED", "COMPLETED"] as const;

function cutoffFor(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function serviceDateCutoff(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function ensureSettings() {
  const [existing] = await db.select().from(dataRetentionSetting).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(dataRetentionSetting).values({ id: 1 }).returning();
  if (!created) throw new AppError("RETENTION_SETTINGS_FAILED", "Could not initialize cleanup settings.");
  return created;
}

export async function getRetentionSettings(): Promise<RetentionSettings> {
  const row = await ensureSettings();
  return {
    enabled: row.enabled,
    retentionDays: row.retentionDays,
    frequency: row.frequency,
    bookings: row.deleteBookings,
    expiredHolds: row.deleteExpiredHolds,
    completedTrips: row.deleteCompletedTrips,
    idempotencyKeys: row.deleteIdempotencyKeys,
    lastRunAt: row.lastRunAt,
  };
}

function eligibleBookingWhere(cutoff: Date) {
  return and(
    inArray(booking.status, [...OLD_BOOKING_STATUSES]),
    sql`${booking.tripId} in (
      select ${trip.id} from ${trip}
      where ${trip.serviceDate} < ${serviceDateCutoff(cutoff)}
        and ${trip.status} in ('COMPLETED', 'CANCELLED')
    )`,
  );
}

function eligibleTripWhere(cutoff: Date) {
  return and(
    lt(trip.serviceDate, serviceDateCutoff(cutoff)),
    inArray(trip.status, [...OLD_TRIP_STATUSES]),
    sql`not exists (
      select 1 from ${booking}
      where ${booking.tripId} = ${trip.id}
    )`,
    sql`not exists (
      select 1 from ${seatHold}
      where ${seatHold.tripId} = ${trip.id} and ${seatHold.status} = 'ACTIVE'
    )`,
  );
}

export async function previewRetention(days: number, selection: RetentionSelection) {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new AppError("INVALID_RETENTION", "Retention must be between 1 and 3,650 days.");
  }
  const cutoff = cutoffFor(days);
  const [counts] = await db.select({
    bookings: sql<number>`(
      select count(*)::int from ${booking}
      where ${eligibleBookingWhere(cutoff)}
    )`,
    payments: sql<number>`(
      select count(*)::int from payment p
      join ${booking} b on b.id = p.booking_id
      join ${trip} t on t.id = b.trip_id
      where b.status in ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        and t.service_date < ${serviceDateCutoff(cutoff)}
        and t.status in ('COMPLETED', 'CANCELLED')
    )`,
    expiredHolds: sql<number>`(
      select count(*)::int from ${seatHold}
      where ${seatHold.status} in ('EXPIRED', 'RELEASED', 'CONSUMED')
        and ${seatHold.createdAt} < ${cutoff}
        and not exists (
          select 1 from ${booking}
          where ${booking.holdId} = ${seatHold.id}
        )
    )`,
    completedTrips: sql<number>`(
      select count(*)::int from ${trip}
      where ${eligibleTripWhere(cutoff)}
    )`,
    idempotencyKeys: sql<number>`(
      select count(*)::int from ${idempotencyKey}
      where ${idempotencyKey.createdAt} < ${cutoff}
    )`,
  }).from(sql`(select 1) as _`);

  return {
    cutoff,
    bookings: selection.bookings ? Number(counts?.bookings ?? 0) : 0,
    payments: selection.bookings ? Number(counts?.payments ?? 0) : 0,
    expiredHolds: selection.expiredHolds ? Number(counts?.expiredHolds ?? 0) : 0,
    completedTrips: selection.completedTrips ? Number(counts?.completedTrips ?? 0) : 0,
    idempotencyKeys: selection.idempotencyKeys ? Number(counts?.idempotencyKeys ?? 0) : 0,
  };
}

export async function deleteRetentionData(days: number, selection: RetentionSelection) {
  if (!Object.values(selection).some(Boolean)) {
    throw new AppError("NO_RETENTION_CATEGORIES", "Select at least one data category.");
  }
  const cutoff = cutoffFor(days);
  return db.transaction(async (tx) => {
    let deletedBookings = 0;
    let deletedHolds = 0;
    let deletedTrips = 0;
    let deletedIdempotencyKeys = 0;

    if (selection.bookings) {
      const deleted = await tx.delete(booking).where(eligibleBookingWhere(cutoff)).returning({ id: booking.id });
      deletedBookings = deleted.length;
    }
    if (selection.expiredHolds) {
      const deleted = await tx.delete(seatHold).where(and(
        inArray(seatHold.status, ["EXPIRED", "RELEASED", "CONSUMED"]),
        lt(seatHold.createdAt, cutoff),
        sql`not exists (
          select 1 from ${booking}
          where ${booking.holdId} = ${seatHold.id}
        )`,
      )).returning({ id: seatHold.id });
      deletedHolds = deleted.length;
    }
    if (selection.completedTrips) {
      const deleted = await tx.delete(trip).where(eligibleTripWhere(cutoff)).returning({ id: trip.id });
      deletedTrips = deleted.length;
    }
    if (selection.idempotencyKeys) {
      const deleted = await tx.delete(idempotencyKey)
        .where(lt(idempotencyKey.createdAt, cutoff))
        .returning({ key: idempotencyKey.key });
      deletedIdempotencyKeys = deleted.length;
    }
    return { deletedBookings, deletedHolds, deletedTrips, deletedIdempotencyKeys, cutoff };
  });
}

export async function updateRetentionSettings(
  values: RetentionSettings,
  agentId: string,
) {
  await ensureSettings();
  const [updated] = await db.update(dataRetentionSetting).set({
    enabled: values.enabled,
    retentionDays: values.retentionDays,
    frequency: values.frequency,
    deleteBookings: values.bookings,
    deleteExpiredHolds: values.expiredHolds,
    deleteCompletedTrips: values.completedTrips,
    deleteIdempotencyKeys: values.idempotencyKeys,
    updatedBy: agentId,
    updatedAt: new Date(),
  }).where(eq(dataRetentionSetting.id, 1)).returning();
  if (!updated) throw new AppError("RETENTION_SETTINGS_FAILED", "Could not save cleanup settings.");
  return getRetentionSettings();
}

export async function runAutomaticRetention() {
  const settings = await getRetentionSettings();
  if (!settings.enabled) return { skipped: true, reason: "disabled" as const };
  if (!settings.bookings && !settings.expiredHolds
      && !settings.completedTrips && !settings.idempotencyKeys) {
    return { skipped: true, reason: "no_categories" as const };
  }
  const interval = settings.frequency === "WEEKLY" ? 7 : 1;
  if (settings.lastRunAt && Date.now() - settings.lastRunAt.getTime() < interval * 24 * 60 * 60 * 1000) {
    return { skipped: true, reason: "not_due" as const };
  }
  const result = await deleteRetentionData(settings.retentionDays, {
    bookings: settings.bookings,
    expiredHolds: settings.expiredHolds,
    completedTrips: settings.completedTrips,
    idempotencyKeys: settings.idempotencyKeys,
  });
  await db.update(dataRetentionSetting).set({ lastRunAt: new Date() }).where(eq(dataRetentionSetting.id, 1));
  return { skipped: false, ...result };
}
