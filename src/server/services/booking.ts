// Server-side only. Not marked `server-only` so the concurrency test harness
// can drive these functions directly under tsx.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  booking, bookingSeat, boardingPoint, bus, payment, route, seat,
  seatHold, seatLayout, trip, tripSeatState,
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
  extraPersonCount?: number;
  extraPersonChargePaise?: number;
  /** Compatibility for callers compiled against the checkbox API. */
  extraPerson?: boolean;
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

export interface EditableBooking {
  id: string;
  pnr: string;
  tripId: string;
  customerName: string;
  customerPhone: string;
  altPhone: string | null;
  boardingPointId: string | null;
  droppingPointId: string | null;
  boardingName: string | null;
  droppingName: string | null;
  note: string | null;
  amountPaidPaise: number;
  paymentType: PaymentType;
  status: "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
  seats: Array<{
    seatId: string; seatNumber: string; berthType: "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
    passengerName: string | null; age: number | null; gender: "M" | "F" | "O" | null;
    farePaise: number; extraPersonCount: number; extraPersonChargePaise: number;
  }>;
}

export async function getEditableBooking(bookingId: string): Promise<EditableBooking | null> {
  const [b] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);
  if (!b) return null;
  const seats = await db.select({
    seatId: bookingSeat.seatId, seatNumber: seat.seatNumber, berthType: seat.berthType,
    passengerName: bookingSeat.passengerName, age: bookingSeat.age, gender: bookingSeat.gender,
    farePaise: bookingSeat.farePaise, extraPersonCount: bookingSeat.extraPersonCount,
    extraPerson: bookingSeat.extraPerson, extraPersonChargePaise: bookingSeat.extraPersonChargePaise,
  }).from(bookingSeat).innerJoin(seat, eq(seat.id, bookingSeat.seatId))
    .where(eq(bookingSeat.bookingId, bookingId)).orderBy(asc(seat.sortOrder));
  return {
    id: b.id, pnr: b.pnr, tripId: b.tripId, customerName: b.primaryPassengerName,
    customerPhone: b.primaryPhone,     altPhone: b.altPhone, boardingPointId: b.boardingPointId,
    droppingPointId: b.droppingPointId, boardingName: b.boardingName,
    droppingName: b.droppingName, note: b.note, amountPaidPaise: b.amountPaidPaise,
    paymentType: b.paymentType, status: b.status,
    seats: seats.map((s) => ({
      ...s, extraPersonCount: s.extraPersonCount || (s.extraPerson ? 1 : 0),
    })),
  };
}

export interface EditableTrip {
  id: string; serviceDate: string; departureAt: Date; arrivalAt: Date;
  direction: "ONWARD" | "RETURN"; routeId: string; routeLabel: string;
  busName: string; registrationNo: string;
  sleeperRows: number; sleeperCols: number; cabinCols: number;
  fareSingleSofaPaise: number; fareDoubleSofaPaise: number; fareCabinPaise: number;
  extraPersonSinglePaise: number; extraPersonDoublePaise: number;
}

export async function listEditableTrips(): Promise<EditableTrip[]> {
  const rows = await db.select({
    id: trip.id, serviceDate: trip.serviceDate, departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt, direction: trip.direction, origin: route.origin,
    destination: route.destination, routeId: trip.routeId, busName: bus.displayName,
    registrationNo: bus.registrationNo, sleeperRows: seatLayout.sleeperRows,
    sleeperCols: seatLayout.sleeperCols, cabinCols: seatLayout.cabinCols,
    fareSingleSofaPaise: bus.fareSingleSofaPaise,
    fareDoubleSofaPaise: bus.fareDoubleSofaPaise, fareCabinPaise: bus.fareCabinPaise,
    extraPersonSinglePaise: bus.extraPersonSinglePaise,
    extraPersonDoublePaise: bus.extraPersonDoublePaise,
  }).from(trip).innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(seatLayout, eq(seatLayout.id, trip.layoutId))
    .where(and(eq(trip.status, "SCHEDULED"), eq(bus.isActive, true), eq(route.isActive, true)))
    .orderBy(trip.serviceDate, trip.departureAt).limit(200);
  return rows.map((r) => ({
    ...r, routeLabel: `${r.origin} → ${r.destination}`,
    departureAt: new Date(r.departureAt), arrivalAt: new Date(r.arrivalAt),
  }));
}

export async function getEditableTripSeats(tripId: string) {
  return db.select({
    seatId: tripSeatState.seatId, seatNumber: seat.seatNumber, deck: seat.deck,
    berthType: seat.berthType, sofaGroupId: seat.sofaGroupId, sofaPosition: seat.sofaPosition,
    rowIndex: seat.rowIndex, colIndex: seat.colIndex, isActive: seat.isActive,
    status: tripSeatState.status, bookingId: tripSeatState.bookingId,
  }).from(tripSeatState).innerJoin(seat, eq(seat.id, tripSeatState.seatId))
    .where(eq(tripSeatState.tripId, tripId)).orderBy(asc(seat.sortOrder));
}

export interface EditablePoint {
  id: string; name: string; kind: "BOARDING" | "DROPPING";
}

export async function getEditableTripPoints(tripId: string): Promise<EditablePoint[]> {
  const rows = await db.select({
    id: boardingPoint.id, name: boardingPoint.name, kind: boardingPoint.kind,
  }).from(boardingPoint).innerJoin(trip, eq(trip.routeId, boardingPoint.routeId))
    .where(and(eq(trip.id, tripId), eq(boardingPoint.isActive, true)))
    .orderBy(asc(boardingPoint.sequence));
  return rows.map((row) => ({
    ...row, kind: row.kind as "BOARDING" | "DROPPING",
  }));
}

export interface UpdateBookingInput {
  bookingId: string; agentId: string; tripId: string;
  customerName: string; customerPhone: string; altPhone?: string | null;
  boardingPointId?: string | null; droppingPointId?: string | null;
  boardingName?: string | null; droppingName?: string | null; note?: string | null;
  paymentType: PaymentType;   amountPaidPaise: number;
  seats: Array<{
    seatId: string; farePaise: number;
    extraPersonCount: number; extraPersonChargePaise: number;
  }>;
}

/** Update passenger data and, when needed, move the booking's inventory atomically. */
export async function updateBooking(p: UpdateBookingInput) {
  if (!p.customerName.trim() || !p.customerPhone.trim()) {
    throw new BookingError("CUSTOMER_REQUIRED", "Customer name and phone are required.");
  }
  if (p.seats.length === 0) throw new BookingError("NO_SEATS", "Select at least one seat.");
  if (p.amountPaidPaise < 0) throw new BookingError("BAD_AMOUNT", "Amount paid cannot be negative.");
  for (const s of p.seats) {
    if (!Number.isInteger(s.farePaise) || s.farePaise < 0 ||
        !Number.isInteger(s.extraPersonCount) || s.extraPersonCount < 0 ||
        s.extraPersonCount > 20 || !Number.isInteger(s.extraPersonChargePaise) ||
        s.extraPersonChargePaise < 0) {
      throw new BookingError("BAD_FARE", "Seat prices and extra-person values are invalid.");
    }
  }

  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(booking).where(eq(booking.id, p.bookingId))
      .for("update").limit(1);
    if (!b) throw new BookingError("NOT_FOUND", "That booking no longer exists.");
    if (b.status === "CANCELLED") throw new BookingError("CANCELLED", "Cancelled bookings cannot be edited.");

    const [target] = await tx.select({ id: trip.id, status: trip.status })
      .from(trip).where(eq(trip.id, p.tripId)).for("update").limit(1);
    if (!target || target.status !== "SCHEDULED") {
      throw new BookingError("TRIP_NOT_BOOKABLE", "Choose a scheduled trip.");
    }

    const oldRows = await tx.select({ tripId: tripSeatState.tripId, seatId: tripSeatState.seatId })
      .from(tripSeatState).where(eq(tripSeatState.bookingId, p.bookingId))
      .for("update");
    const targetRows = await tx.select({
      seatId: tripSeatState.seatId, status: tripSeatState.status,
      bookingId: tripSeatState.bookingId, berthType: seat.berthType,
    }).from(tripSeatState).innerJoin(seat, eq(seat.id, tripSeatState.seatId))
      .where(and(eq(tripSeatState.tripId, p.tripId), inArray(
        tripSeatState.seatId, p.seats.map((s) => s.seatId),
      ))).for("update");
    if (targetRows.length !== new Set(p.seats.map((s) => s.seatId)).size) {
      throw new BookingError("SEAT_NOT_ON_TRIP", "One or more selected seats are not on that trip.");
    }
    const oldIds = new Set(oldRows.map((r) => r.seatId));
    for (const row of targetRows) {
      if (row.status !== "AVAILABLE" && !(row.status === "BOOKED" && row.bookingId === p.bookingId)
          && !(p.tripId === b.tripId && oldIds.has(row.seatId))) {
        throw new SeatConflictError([], [row.seatId]);
      }
    }
    for (const s of p.seats) {
      const row = targetRows.find((r) => r.seatId === s.seatId)!;
      if (row.berthType === "CABIN" && s.extraPersonCount > 0) {
        throw new BookingError("EXTRA_PERSON_NOT_ALLOWED", "An extra person is not allowed in a cabin seat.");
      }
    }

    const total = p.seats.reduce(
      (sum, s) => sum + s.farePaise + s.extraPersonCount * s.extraPersonChargePaise, 0);
    if (p.amountPaidPaise > total) throw new BookingError("OVERPAID", "Amount paid is more than the new total.");
    const paymentStatus = p.amountPaidPaise === 0 ? "UNPAID" as const
      : p.amountPaidPaise < total ? "PARTIAL" as const : "PAID" as const;

    await tx.update(tripSeatState).set({
      status: "AVAILABLE", bookingId: null, holdId: null, heldUntil: null,
      version: sql`${tripSeatState.version} + 1`, updatedAt: sql`now()`,
    }).where(and(eq(tripSeatState.bookingId, p.bookingId),
      p.tripId === b.tripId ? sql`${tripSeatState.seatId} not in ${p.seats.map((s) => s.seatId)}`
        : sql`true`));
    await tx.update(tripSeatState).set({
      status: "BOOKED", bookingId: p.bookingId, holdId: null, heldUntil: null,
      version: sql`${tripSeatState.version} + 1`, updatedAt: sql`now()`,
    }).where(and(eq(tripSeatState.tripId, p.tripId),
      inArray(tripSeatState.seatId, p.seats.map((s) => s.seatId))));

    await tx.delete(bookingSeat).where(eq(bookingSeat.bookingId, p.bookingId));
    await tx.insert(bookingSeat).values(p.seats.map((s) => ({
      bookingId: p.bookingId, seatId: s.seatId,
      passengerName: null, age: null, gender: null,
      farePaise: s.farePaise + s.extraPersonCount * s.extraPersonChargePaise,
      extraPersonCount: s.extraPersonCount, extraPerson: s.extraPersonCount > 0,
      extraPersonChargePaise: s.extraPersonChargePaise,
    })));
    const nameOfPoint = async (id?: string | null) => {
      if (!id) return null;
      const [row] = await tx.select({ name: boardingPoint.name })
        .from(boardingPoint).where(eq(boardingPoint.id, id)).limit(1);
      return row?.name ?? null;
    };
    const boardingName = p.boardingName?.trim() || await nameOfPoint(p.boardingPointId);
    const droppingName = p.droppingName?.trim() || await nameOfPoint(p.droppingPointId);

    await tx.update(booking).set({
      tripId: p.tripId, primaryPassengerName: p.customerName.trim(),
      primaryPhone: p.customerPhone.trim(), altPhone: p.altPhone?.trim() || null,
      boardingPointId: p.boardingPointId ?? null, droppingPointId: p.droppingPointId ?? null,
      boardingName, droppingName,
      note: p.note?.trim() || null, amountTotalPaise: total, amountPaidPaise: p.amountPaidPaise,
      paymentType: p.paymentType, paymentStatus, updatedByAgentId: p.agentId, updatedAt: sql`now()`,
    }).where(eq(booking.id, p.bookingId));
    await writeAudit(tx, {
      agentId: p.agentId, action: "BOOKING_UPDATED", entityType: "booking", entityId: p.bookingId,
      before: { tripId: b.tripId, amountTotalPaise: b.amountTotalPaise },
      after: { tripId: p.tripId, amountTotalPaise: total, seatCount: p.seats.length },
    });
    return { amountTotalPaise: total, paymentStatus };
  });
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
    const count = s.extraPersonCount ?? (s.extraPerson ? 1 : 0);
    const charge = s.extraPersonChargePaise ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > 20 ||
        !Number.isInteger(charge) || charge < 0) {
      throw new BookingError("BAD_EXTRA_PERSON", "Extra-person counts and charges are invalid.");
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
      routeCode: route.code, direction: trip.direction,
      extraPersonSinglePaise: bus.extraPersonSinglePaise,
      extraPersonDoublePaise: bus.extraPersonDoublePaise,
    }).from(trip)
      .innerJoin(route, eq(route.id, trip.routeId))
      .innerJoin(bus, eq(bus.id, trip.busId))
      .where(eq(trip.id, h.tripId)).limit(1);
    if (!t) throw new BookingError("TRIP_NOT_FOUND", "That trip no longer exists.");
    if (t.status !== "SCHEDULED") {
      throw new BookingError("TRIP_NOT_BOOKABLE",
        `This trip is ${t.status.toLowerCase()} and cannot be booked.`);
    }

    const seatRows = await tx.select({ id: seat.id, berthType: seat.berthType })
      .from(seat).where(sql`${seat.id} in ${asked}`);
    const berthTypeById = new Map(seatRows.map((s) => [s.id, s.berthType]));
    const extraPersonCount = (s: ConfirmSeatInput) =>
      s.extraPersonCount ?? (s.extraPerson ? 1 : 0);
    const extraPersonCharge = (s: ConfirmSeatInput) => {
      if (extraPersonCount(s) === 0) return 0;
      const type = berthTypeById.get(s.seatId);
      if (type === "SLEEPER_SINGLE") return s.extraPersonChargePaise ?? t.extraPersonSinglePaise;
      if (type === "SLEEPER_DOUBLE") return s.extraPersonChargePaise ?? t.extraPersonDoublePaise;
      throw new BookingError("EXTRA_PERSON_NOT_ALLOWED", "An extra person is not allowed in a cabin seat.");
    };
    const amountTotalPaise = p.seats.reduce(
      (sum, s) => sum + s.farePaise + extraPersonCount(s) * extraPersonCharge(s), 0);
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
        const prefix = t.direction === "RETURN"
          ? t.routeCode.split("-").at(-1)?.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
          : t.routeCode.split("-")[0]?.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const pnrPrefix = prefix || "BK";
        const pnrDate = `${t.serviceDate.slice(8, 10)}${t.serviceDate.slice(5, 7)}${t.serviceDate.slice(2, 4)}`;
        const [counter] = await tx.execute<{ next_number: number }>(sql`
          select coalesce(max(substring(${booking.pnr} from '[0-9]{4}$')::int), 0) + 1 as next_number
          from ${booking}
          where ${booking.pnr} like ${`${pnrPrefix}-${pnrDate}-%`}
        `).then((r) => r.rows);
        [created] = await tx.insert(booking).values({
          pnr: generatePnr(t.routeCode, t.serviceDate, t.direction, Number(counter?.next_number ?? 1)),
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
      farePaise: s.farePaise + extraPersonCount(s) * extraPersonCharge(s),
      extraPersonCount: extraPersonCount(s),
      extraPerson: extraPersonCount(s) > 0,
      extraPersonChargePaise: extraPersonCharge(s),
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
