// Server-side only. Not marked `server-only` so the concurrency test harness
// can drive these functions directly under tsx.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  booking, bookingSeat, boardingPoint, payment, route, seat,
  seatHold, trip, tripSeatState,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { generatePnr } from "@/lib/pnr";
import { HoldError, SeatConflictError } from "./seat-hold";

export type PaymentType = "CASH" | "ONLINE" | "PENDING";

export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export interface ConfirmSeatInput {
  seatId: string;
  passengerName?: string | null;
  age?: number | null;
  gender?: "M" | "F" | "O" | null;
  /** price actually charged for this berth, in paise */
  farePaise: number;
}

export interface ConfirmBookingInput {
  holdId: string;
  agentId: string;
  customerName: string;
  customerPhone: string;
  altPhone?: string | null;
  seats: ConfirmSeatInput[];
  paymentType: PaymentType;
  /** what was actually collected now; defaults to the full amount unless PENDING */
  amountPaidPaise?: number | null;
  boardingPointId?: string | null;
  boardingName?: string | null;
  droppingPointId?: string | null;
  droppingName?: string | null;
  note?: string | null;
}

export interface ConfirmBookingResult {
  bookingId: string;
  pnr: string;
  amountTotalPaise: number;
  amountPaidPaise: number;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  seatNumbers: string[];
}

/**
 * Turn a live hold into a booking.
 *
 * Booking row, per-seat rows, the seat flip from HELD to BOOKED, the hold
 * consumption and the audit entry all happen in ONE transaction. There is no
 * instant at which money is recorded but seats are not, or the reverse.
 *
 * The hold is re-checked under `FOR UPDATE` rather than trusted from an earlier
 * read: between selecting seats and typing the customer's name, the hold may
 * have expired or been force-released by a colleague.
 */
export async function confirmBooking(
  p: ConfirmBookingInput,
): Promise<ConfirmBookingResult> {
  if (p.seats.length === 0) {
    throw new BookingError("NO_SEATS", "The booking has no seats.");
  }
  if (!p.customerName.trim()) {
    throw new BookingError("NAME_REQUIRED", "Enter the customer's name.");
  }
  if (!p.customerPhone.trim()) {
    throw new BookingError("PHONE_REQUIRED", "Enter the customer's phone number.");
  }
  for (const s of p.seats) {
    if (!Number.isInteger(s.farePaise) || s.farePaise < 0) {
      throw new BookingError("BAD_FARE", "Seat prices must be whole, non-negative amounts.");
    }
  }

  return db.transaction(async (tx) => {
    const [h] = await tx.select().from(seatHold)
      .where(eq(seatHold.id, p.holdId)).for("update").limit(1);

    if (!h) throw new HoldError("HOLD_NOT_FOUND", "That reservation no longer exists.");
    if (h.status === "CONSUMED") {
      throw new BookingError("ALREADY_BOOKED",
        "This reservation has already been turned into a booking.");
    }
    if (h.status !== "ACTIVE" || new Date(h.expiresAt).getTime() <= Date.now()) {
      throw new HoldError("HOLD_EXPIRED",
        "The reservation expired before payment was recorded. Please select the seats again.");
    }
    if (h.agentId !== p.agentId) {
      throw new HoldError("HOLD_NOT_YOURS",
        "That reservation was made by another agent.");
    }

    // the seats being booked must be exactly the seats this hold owns
    const heldRows = await tx.select({ seatId: tripSeatState.seatId })
      .from(tripSeatState)
      .where(and(
        eq(tripSeatState.holdId, p.holdId),
        eq(tripSeatState.status, "HELD"),
      ));
    const heldIds = new Set(heldRows.map((r) => r.seatId));
    const asked = p.seats.map((s) => s.seatId);

    if (heldIds.size !== asked.length || !asked.every((id) => heldIds.has(id))) {
      const missing = asked.filter((id) => !heldIds.has(id));
      const rows = missing.length
        ? await tx.select({ seatNumber: seat.seatNumber }).from(seat)
            .where(sql`${seat.id} in ${missing}`)
        : [];
      throw new SeatConflictError(rows.map((r) => r.seatNumber), missing);
    }

    const [t] = await tx.select({
      id: trip.id, status: trip.status, serviceDate: trip.serviceDate,
      routeCode: route.code,
    }).from(trip)
      .innerJoin(route, eq(route.id, trip.routeId))
      .where(eq(trip.id, h.tripId)).limit(1);
    if (!t) throw new BookingError("TRIP_NOT_FOUND", "That trip no longer exists.");
    if (t.status !== "SCHEDULED") {
      throw new BookingError("TRIP_NOT_BOOKABLE",
        `This trip is ${t.status.toLowerCase()} and cannot be booked.`);
    }

    const amountTotalPaise = p.seats.reduce((sum, s) => sum + s.farePaise, 0);
    const amountPaidPaise = p.paymentType === "PENDING"
      ? Math.max(0, p.amountPaidPaise ?? 0)
      : Math.max(0, p.amountPaidPaise ?? amountTotalPaise);
    if (amountPaidPaise > amountTotalPaise) {
      throw new BookingError("OVERPAID",
        "Amount collected is more than the ticket total.");
    }
    const paymentStatus = amountPaidPaise === 0
      ? "UNPAID" as const
      : amountPaidPaise < amountTotalPaise ? "PARTIAL" as const : "PAID" as const;

    // resolve pickup / destination names once, so the ticket is stable
    const nameOfPoint = async (id?: string | null) => {
      if (!id) return null;
      const [row] = await tx.select({ name: boardingPoint.name })
        .from(boardingPoint).where(eq(boardingPoint.id, id)).limit(1);
      return row?.name ?? null;
    };
    const boardingName = p.boardingName?.trim() || await nameOfPoint(p.boardingPointId);
    const droppingName = p.droppingName?.trim() || await nameOfPoint(p.droppingPointId);

    // PNR collisions are astronomically unlikely but cheap to retry
    let created: typeof booking.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      try {
        [created] = await tx.insert(booking).values({
          pnr: generatePnr(t.routeCode, t.serviceDate),
          tripId: h.tripId,
          primaryPassengerName: p.customerName.trim(),
          primaryPhone: p.customerPhone.trim(),
          altPhone: p.altPhone?.trim() || null,
          amountTotalPaise,
          amountPaidPaise,
          paymentType: p.paymentType,
          paymentStatus,
          status: "CONFIRMED",
          boardingPointId: p.boardingPointId ?? null,
          droppingPointId: p.droppingPointId ?? null,
          boardingName,
          droppingName,
          note: p.note?.trim() || null,
          holdId: p.holdId,
          createdByAgentId: p.agentId,
          updatedByAgentId: p.agentId,
        }).returning();
      } catch (e) {
        if (attempt === 4 || !String(e).includes("booking_pnr_uq")) throw e;
      }
    }
    if (!created) throw new BookingError("PNR_FAILED", "Could not allocate a ticket number.");

    await tx.insert(bookingSeat).values(p.seats.map((s) => ({
      bookingId: created!.id,
      seatId: s.seatId,
      passengerName: s.passengerName?.trim() || null,
      age: s.age ?? null,
      gender: s.gender ?? null,
      farePaise: s.farePaise,
    })));

    const flipped = await tx.update(tripSeatState).set({
      status: "BOOKED",
      bookingId: created.id,
      holdId: null,
      heldUntil: null,
      version: sql`${tripSeatState.version} + 1`,
      updatedAt: sql`now()`,
    }).where(and(
      eq(tripSeatState.holdId, p.holdId),
      eq(tripSeatState.status, "HELD"),
    )).returning({ seatId: tripSeatState.seatId });

    // belt and braces: if the flip touched a different number of rows than the
    // hold owned, something raced us — roll the whole thing back
    if (flipped.length !== p.seats.length) {
      throw new SeatConflictError([], []);
    }

    await tx.update(seatHold).set({ status: "CONSUMED" })
      .where(eq(seatHold.id, p.holdId));

    const seatNumbers = (await tx.select({ seatNumber: seat.seatNumber })
      .from(seat).where(sql`${seat.id} in ${asked}`).orderBy(seat.sortOrder))
      .map((r) => r.seatNumber);

    await writeAudit(tx, {
      agentId: p.agentId,
      action: "BOOKING_CREATED",
      entityType: "booking",
      entityId: created.id,
      after: {
        pnr: created.pnr, tripId: h.tripId, seats: seatNumbers,
        customerName: created.primaryPassengerName,
        customerPhone: created.primaryPhone,
        amountTotalPaise, amountPaidPaise,
        paymentType: p.paymentType, paymentStatus,
      },
    });

    return {
      bookingId: created.id,
      pnr: created.pnr,
      amountTotalPaise,
      amountPaidPaise,
      paymentStatus,
      seatNumbers,
    };
  });
}

/** Cancel a booking and return its seats to the pool, atomically. */
export async function cancelBooking(p: {
  bookingId: string; agentId: string; reason: string; refundPaise?: number | null;
}): Promise<{ seatsFreed: number }> {
  if (!p.reason?.trim()) {
    throw new BookingError("REASON_REQUIRED", "Give a reason for the cancellation.");
  }

  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(booking)
      .where(eq(booking.id, p.bookingId)).for("update").limit(1);
    if (!b) throw new BookingError("NOT_FOUND", "That booking no longer exists.");
    if (b.status === "CANCELLED") {
      throw new BookingError("ALREADY_CANCELLED", "This booking is already cancelled.");
    }

    const freed = await tx.update(tripSeatState).set({
      status: "AVAILABLE", bookingId: null, holdId: null, heldUntil: null,
      version: sql`${tripSeatState.version} + 1`, updatedAt: sql`now()`,
    }).where(and(
      eq(tripSeatState.bookingId, p.bookingId),
      eq(tripSeatState.status, "BOOKED"),
    )).returning({ seatId: tripSeatState.seatId });

    await tx.update(booking).set({
      status: "CANCELLED",
      cancelledAt: sql`now()`,
      cancelledBy: p.agentId,
      cancelReason: p.reason.trim(),
      refundPaise: p.refundPaise ?? null,
      updatedByAgentId: p.agentId,
      updatedAt: sql`now()`,
    }).where(eq(booking.id, p.bookingId));

    await writeAudit(tx, {
      agentId: p.agentId, action: "BOOKING_CANCELLED",
      entityType: "booking", entityId: p.bookingId,
      before: { status: b.status, pnr: b.pnr },
      after: { reason: p.reason.trim(), refundPaise: p.refundPaise ?? null,
               seatsFreed: freed.length },
    });

    return { seatsFreed: freed.length };
  });
}

/** Record money against a booking that was left PENDING or part-paid. */
export async function recordPayment(p: {
  bookingId: string; agentId: string; amountPaise: number;
  paymentType: PaymentType; referenceNo?: string | null;
}): Promise<{ amountPaidPaise: number; paymentStatus: "PAID" | "PARTIAL" | "UNPAID" }> {
  if (p.amountPaise <= 0) {
    throw new BookingError("BAD_AMOUNT", "Enter an amount greater than zero.");
  }
  if (p.paymentType === "PENDING") {
    throw new BookingError("BAD_PAYMENT_TYPE",
      "Recording a payment needs cash or online, not pending.");
  }

  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(booking)
      .where(eq(booking.id, p.bookingId)).for("update").limit(1);
    if (!b) throw new BookingError("NOT_FOUND", "That booking no longer exists.");
    if (b.status === "CANCELLED") {
      throw new BookingError("CANCELLED", "This booking is cancelled.");
    }

    const paid = b.amountPaidPaise + p.amountPaise;
    if (paid > b.amountTotalPaise) {
      throw new BookingError("OVERPAID",
        "That is more than the outstanding balance.");
    }
    const paymentStatus = paid === 0
      ? "UNPAID" as const
      : paid < b.amountTotalPaise ? "PARTIAL" as const : "PAID" as const;

    await tx.update(booking).set({
      amountPaidPaise: paid,
      paymentStatus,
      // once money actually arrives, the booking is no longer "pay later"
      paymentType: paymentStatus === "PAID" ? p.paymentType : b.paymentType,
      updatedByAgentId: p.agentId,
      updatedAt: sql`now()`,
    }).where(eq(booking.id, p.bookingId));

    await tx.insert(payment).values({
      bookingId: p.bookingId,
      amountPaise: p.amountPaise,
      paymentType: p.paymentType,
      referenceNo: p.referenceNo ?? null,
      receivedByAgentId: p.agentId,
    });

    await writeAudit(tx, {
      agentId: p.agentId, action: "PAYMENT_RECORDED",
      entityType: "booking", entityId: p.bookingId,
      before: { amountPaidPaise: b.amountPaidPaise, paymentStatus: b.paymentStatus },
      after: { amountPaidPaise: paid, paymentStatus,
               added: p.amountPaise, paymentType: p.paymentType,
               referenceNo: p.referenceNo ?? null },
    });

    return { amountPaidPaise: paid, paymentStatus };
  });
}
