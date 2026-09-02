"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { confirmBookingSchema, holdSeatsSchema } from "@/lib/schemas";
import {
  createHold, extendHold, releaseHold, getTripSeatStates, resolveSeatNumbers,
  getActiveHold, setHoldProvisional,
  SeatConflictError, HoldError, type SeatStateRow,
} from "@/server/services/seat-hold";
import { confirmBooking, BookingError } from "@/server/services/booking";

export interface Result<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  conflictingSeats?: string[];
  fieldErrors?: Record<string, string>;
}

function fail<T>(e: unknown): Result<T> {
  if (e instanceof SeatConflictError) {
    return { ok: false, code: "SEAT_CONFLICT", error: e.message,
             conflictingSeats: e.conflictingSeatNumbers };
  }
  if (e instanceof HoldError) return { ok: false, code: e.code, error: e.message };
  if (e instanceof BookingError) return { ok: false, code: e.code, error: e.message };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function zodFail<T>(e: z.ZodError): Result<T> {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.map(String).join(".");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { ok: false, code: "VALIDATION_FAILED",
           error: e.issues[0]?.message, fieldErrors };
}

export interface SeatSnapshot {
  seats: SeatStateRow[];
  serverNow: string;
}

/** Poll target for the live seat map. */
export async function fetchSeatsAction(tripId: string): Promise<SeatSnapshot> {
  await requireSession();
  const { seats, serverNow } = await getTripSeatStates(tripId);
  return { seats, serverNow: serverNow.toISOString() };
}

export async function holdSeatsAction(raw: unknown): Promise<Result<{
  holdId: string; expiresAt: string; serverNow: string; seatNumbers: string[];
}>> {
  const session = await requireSession();
  const parsed = holdSeatsSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);

  try {
    const h = await createHold({
      tripId: parsed.data.tripId,
      seatIds: parsed.data.seatIds,
      agentId: session.agentId,
      provisionalName: parsed.data.provisionalName || null,
      provisionalPhone: parsed.data.provisionalPhone || null,
    });
    return { ok: true, data: {
      holdId: h.holdId,
      expiresAt: h.expiresAt.toISOString(),
      serverNow: h.serverNow.toISOString(),
      seatNumbers: h.seatNumbers,
    } };
  } catch (e) { return fail(e); }
}

export async function extendHoldAction(holdId: string): Promise<Result<{
  expiresAt: string; serverNow: string; extensionCount: number;
}>> {
  const session = await requireSession();
  try {
    const r = await extendHold({ holdId, agentId: session.agentId });
    return { ok: true, data: {
      expiresAt: r.expiresAt.toISOString(),
      serverNow: r.serverNow.toISOString(),
      extensionCount: r.extensionCount,
    } };
  } catch (e) { return fail(e); }
}

export async function releaseHoldAction(
  holdId: string, reason?: string,
): Promise<Result> {
  const session = await requireSession();
  try {
    await releaseHold({ holdId, agentId: session.agentId, reason: reason ?? null });
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Turn typed seat numbers into ids, so an agent can key "U7, L3" instead of clicking. */
export async function resolveSeatNumbersAction(
  tripId: string, raw: string,
): Promise<Result<{ found: { seatId: string; seatNumber: string }[]; unknown: string[] }>> {
  await requireSession();
  const numbers = raw.split(/[\s,;/]+/).filter(Boolean);
  if (numbers.length === 0) {
    return { ok: false, error: "Type one or more seat numbers." };
  }
  const r = await resolveSeatNumbers(tripId, numbers);
  return { ok: true, data: r };
}

export async function confirmBookingAction(raw: unknown): Promise<Result<{
  bookingId: string; pnr: string; amountTotalPaise: number;
  amountPaidPaise: number; paymentStatus: string; seatNumbers: string[];
}>> {
  const session = await requireSession();
  const parsed = confirmBookingSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);
  const v = parsed.data;

  try {
    const r = await confirmBooking({
      holdId: v.holdId,
      agentId: session.agentId,
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      altPhone: v.altPhone || null,
      paymentType: v.paymentType,
      amountPaidPaise: v.amountPaid ?? null,
      boardingPointId: v.boardingPointId ?? null,
      boardingName: v.boardingName || null,
      droppingPointId: v.droppingPointId ?? null,
      droppingName: v.droppingName || null,
      note: v.note || null,
      seats: v.seats.map((s) => ({
        seatId: s.seatId,
        passengerName: s.passengerName || null,
        age: s.age ?? null,
        gender: s.gender ?? null,
        farePaise: s.fare,
      })),
    });
    revalidatePath("/trips");
    revalidatePath("/bookings");
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}

/** Park the current reservation with a note about who it is for. */
export async function parkHoldAction(
  holdId: string, name: string, phone: string,
): Promise<Result> {
  const session = await requireSession();
  try {
    await setHoldProvisional({
      holdId, agentId: session.agentId,
      provisionalName: name, provisionalPhone: phone,
    });
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Reload a still-live reservation so an agent can finish it later. */
export async function resumeHoldAction(holdId: string): Promise<Result<{
  holdId: string; tripId: string; expiresAt: string; serverNow: string;
  seatIds: string[]; seatNumbers: string[];
  provisionalName: string | null; provisionalPhone: string | null;
}>> {
  const session = await requireSession();
  const h = await getActiveHold(holdId, session.agentId);
  if (!h) {
    return { ok: false, code: "HOLD_EXPIRED",
             error: "That reservation has expired or was released." };
  }
  if (!h.isMine) {
    return { ok: false, code: "HOLD_NOT_YOURS",
             error: `Those seats are held by ${h.agentName}.` };
  }
  return { ok: true, data: {
    holdId: h.holdId, tripId: h.tripId,
    expiresAt: h.expiresAt.toISOString(),
    serverNow: new Date().toISOString(),
    seatIds: h.seatIds, seatNumbers: h.seatNumbers,
    provisionalName: h.provisionalName, provisionalPhone: h.provisionalPhone,
  } };
}
