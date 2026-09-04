"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { failure } from "@/server/errors";
import { cancelBooking } from "@/server/services/booking";

const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().min(1, "Give a reason for the cancellation.").max(500),
});

export async function cancelBookingAction(raw: {
  bookingId: string;
  reason: string;
}): Promise<{ ok: boolean; seatsFreed?: number; error?: string; code?: string }> {
  try {
    const session = await requireSession();
    const parsed = cancelBookingSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        error: parsed.error.issues[0]?.message ?? "Enter a valid cancellation reason.",
      };
    }

    const result = await cancelBooking({
      bookingId: parsed.data.bookingId,
      agentId: session.agentId,
      reason: parsed.data.reason,
    });
    revalidatePath("/bookings");
    revalidatePath("/trips");
    revalidatePath(`/tickets/${parsed.data.bookingId}`);
    return { ok: true, seatsFreed: result.seatsFreed };
  } catch (e) {
    return failure(e, "cancelBooking");
  }
}
