"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { failure, zodFailure } from "@/server/errors";
import { editBookingSchema } from "@/lib/schemas";
import {
  getEditableTripPoints, getEditableTripSeats, updateBooking,
} from "@/server/services/booking";

export async function fetchEditTripSeatsAction(tripId: string) {
  try {
    await requireSession();
    const parsed = z.string().uuid().safeParse(tripId);
    if (!parsed.success) return { ok: false as const, error: "Choose a valid trip." };
    const [seats, points] = await Promise.all([
      getEditableTripSeats(parsed.data), getEditableTripPoints(parsed.data),
    ]);
    return { ok: true as const, data: { seats, points } };
  } catch (e) {
    return failure(e, "fetchEditTripSeats");
  }
}

export async function updateBookingAction(raw: unknown) {
  try {
    const session = await requireSession();
    const parsed = editBookingSchema.safeParse(raw);
    if (!parsed.success) return zodFailure(parsed.error);
    const v = parsed.data;
    const result = await updateBooking({
      bookingId: v.bookingId, agentId: session.agentId, tripId: v.tripId,
      customerName: v.customerName, customerPhone: v.customerPhone, altPhone: v.altPhone || null,
      boardingPointId: v.boardingPointId ?? null, droppingPointId: v.droppingPointId ?? null,
      boardingName: v.boardingName || null, droppingName: v.droppingName || null,
      note: v.note || null, paymentType: v.paymentType, amountPaidPaise: v.amountPaid,
      seats: v.seats.map((s) => ({
        seatId: s.seatId, farePaise: s.fare,
        extraPersonCount: s.extraPersonCount, extraPersonChargePaise: s.extraPersonCharge,
      })),
    });
    revalidatePath("/bookings");
    revalidatePath(`/tickets/${v.bookingId}`);
    revalidatePath(`/bookings/${v.bookingId}/edit`);
    revalidatePath("/trips");
    return { ok: true as const, data: result };
  } catch (e) {
    return failure(e, "updateBooking");
  }
}
