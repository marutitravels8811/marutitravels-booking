// Server-side only. Not marked `server-only` so scripts can render tickets.
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  agent, booking, bookingSeat, bus, route, seat, trip,
} from "@/db/schema";

export interface TicketSeat {
  seatNumber: string;
  deck: "UPPER" | "LOWER" | "CABIN";
  berthType: "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
  passengerName: string | null;
  age: number | null;
  gender: "M" | "F" | "O" | null;
  farePaise: number;
}

export interface TicketData {
  bookingId: string;
  pnr: string;
  status: "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";

  customerName: string;
  customerPhone: string;
  altPhone: string | null;

  routeCode: string;
  origin: string;
  destination: string;
  direction: "ONWARD" | "RETURN";
  serviceDate: string;
  departureAt: Date;
  arrivalAt: Date;

  busName: string;
  registrationNo: string;

  boardingName: string | null;
  droppingName: string | null;

  seats: TicketSeat[];
  amountTotalPaise: number;
  amountPaidPaise: number;
  paymentType: "CASH" | "ONLINE" | "PENDING";
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";

  note: string | null;
  bookedByName: string;
  bookedAt: Date;
}

const BASE_COLUMNS = {
  bookingId: booking.id,
  pnr: booking.pnr,
  status: booking.status,
  customerName: booking.primaryPassengerName,
  customerPhone: booking.primaryPhone,
  altPhone: booking.altPhone,
  routeCode: route.code,
  origin: route.origin,
  destination: route.destination,
  direction: trip.direction,
  serviceDate: trip.serviceDate,
  departureAt: trip.departureAt,
  arrivalAt: trip.arrivalAt,
  busName: bus.displayName,
  registrationNo: bus.registrationNo,
  boardingName: booking.boardingName,
  droppingName: booking.droppingName,
  amountTotalPaise: booking.amountTotalPaise,
  amountPaidPaise: booking.amountPaidPaise,
  paymentType: booking.paymentType,
  paymentStatus: booking.paymentStatus,
  note: booking.note,
  bookedByName: agent.name,
  bookedAt: booking.createdAt,
} as const;

function baseQuery() {
  return db
    .select(BASE_COLUMNS)
    .from(booking)
    .innerJoin(trip, eq(trip.id, booking.tripId))
    .innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(agent, eq(agent.id, booking.createdByAgentId));
}

/** The query builder is thenable, so awaiting its return type gives the rows. */
type BaseRow = Awaited<ReturnType<typeof baseQuery>>[number];

/** Attach seats to booking rows in one extra query rather than N. */
async function withSeats(rows: BaseRow[]): Promise<TicketData[]> {
  if (rows.length === 0) return [];

  const seatRows = await db
    .select({
      bookingId: bookingSeat.bookingId,
      seatNumber: seat.seatNumber,
      deck: seat.deck,
      berthType: seat.berthType,
      sortOrder: seat.sortOrder,
      passengerName: bookingSeat.passengerName,
      age: bookingSeat.age,
      gender: bookingSeat.gender,
      farePaise: bookingSeat.farePaise,
    })
    .from(bookingSeat)
    .innerJoin(seat, eq(seat.id, bookingSeat.seatId))
    .where(inArray(bookingSeat.bookingId, rows.map((r) => r.bookingId)))
    .orderBy(asc(seat.sortOrder));

  const byBooking = new Map<string, TicketSeat[]>();
  for (const s of seatRows) {
    const list = byBooking.get(s.bookingId) ?? [];
    list.push({
      seatNumber: s.seatNumber, deck: s.deck, berthType: s.berthType,
      passengerName: s.passengerName, age: s.age, gender: s.gender,
      farePaise: s.farePaise,
    });
    byBooking.set(s.bookingId, list);
  }

  return rows.map((r) => ({
    ...r,
    departureAt: new Date(r.departureAt),
    arrivalAt: new Date(r.arrivalAt),
    bookedAt: new Date(r.bookedAt),
    seats: byBooking.get(r.bookingId) ?? [],
  })) as TicketData[];
}

export async function getTicket(bookingId: string): Promise<TicketData | null> {
  const rows = await baseQuery().where(eq(booking.id, bookingId)).limit(1);
  const [ticket] = await withSeats(rows);
  return ticket ?? null;
}

export async function getTicketsByIds(ids: string[]): Promise<TicketData[]> {
  if (ids.length === 0) return [];
  const rows = await baseQuery().where(inArray(booking.id, ids));
  const tickets = await withSeats(rows);
  // preserve the order the caller asked for
  const order = new Map(ids.map((id, i) => [id, i]));
  return tickets.sort((a, b) =>
    (order.get(a.bookingId) ?? 0) - (order.get(b.bookingId) ?? 0));
}

/**
 * Every live ticket on a trip, ordered by seat so a batch print comes off the
 * printer in the same order as the passenger chart.
 */
export async function getTicketsForTrip(
  tripId: string, opts: { includeCancelled?: boolean } = {},
): Promise<TicketData[]> {
  const where = opts.includeCancelled
    ? eq(booking.tripId, tripId)
    : and(eq(booking.tripId, tripId), ne(booking.status, "CANCELLED"));

  const rows = await baseQuery().where(where);
  const tickets = await withSeats(rows);

  return tickets.sort((a, b) => {
    const deckRank = (d: string) => (d === "CABIN" ? 0 : d === "LOWER" ? 1 : 2);
    const sa = a.seats[0], sb = b.seats[0];
    if (!sa || !sb) return 0;
    return deckRank(sa.deck) - deckRank(sb.deck)
      || sa.seatNumber.localeCompare(sb.seatNumber, undefined, { numeric: true });
  });
}

export interface TripHeaderInfo {
  tripId: string;
  routeCode: string;
  origin: string;
  destination: string;
  direction: "ONWARD" | "RETURN";
  serviceDate: string;
  departureAt: Date;
  arrivalAt: Date;
  busName: string;
  registrationNo: string;
  totalSeats: number;
}

export async function getTripHeader(tripId: string): Promise<TripHeaderInfo | null> {
  const [row] = await db
    .select({
      tripId: trip.id, routeCode: route.code, origin: route.origin,
      destination: route.destination, direction: trip.direction,
      serviceDate: trip.serviceDate, departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt, busName: bus.displayName,
      registrationNo: bus.registrationNo, totalSeats: trip.totalSeats,
    })
    .from(trip)
    .innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .where(eq(trip.id, tripId)).limit(1);

  if (!row) return null;
  return {
    ...row,
    departureAt: new Date(row.departureAt),
    arrivalAt: new Date(row.arrivalAt),
  };
}
