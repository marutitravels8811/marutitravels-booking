import { and, desc, eq, gte, ilike, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agent, booking, bookingSeat, bus, route, seat, trip } from "@/db/schema";
import { serviceDateOf } from "@/lib/time";

export interface ReportRange {
  from: string;
  to: string;
}

export function defaultReportRange(): ReportRange {
  const today = serviceDateOf();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function validReportRange(from?: string, to?: string): ReportRange {
  const fallback = defaultReportRange();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? from! : fallback.from;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to ?? "") ? to! : fallback.to;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function endExclusive(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function createdAtRange(range: ReportRange): SQL {
  const start = new Date(`${range.from}T00:00:00+05:30`);
  const end = new Date(`${endExclusive(range.to)}T00:00:00+05:30`);
  return and(gte(booking.createdAt, start), lt(booking.createdAt, end))!;
}

function travelDateRange(range: ReportRange): SQL {
  return and(gte(trip.serviceDate, range.from), lte(trip.serviceDate, range.to))!;
}

export async function getReportSummary(range: ReportRange) {
  const [bookingTotal] = await db.select({ count: sql<number>`count(*)::int` })
    .from(booking).where(createdAtRange(range));
  const [travelled] = await db.select({
    bookings: sql<number>`count(*)::int`,
    seats: sql<number>`coalesce(sum((select count(*) from ${bookingSeat} bs where bs.booking_id = ${booking.id})), 0)::int`,
    totalPaise: sql<number>`coalesce(sum(${booking.amountTotalPaise}), 0)::bigint`,
    paidPaise: sql<number>`coalesce(sum(${booking.amountPaidPaise}), 0)::bigint`,
  }).from(booking).innerJoin(trip, eq(trip.id, booking.tripId))
    .where(and(travelDateRange(range), ne(booking.status, "CANCELLED")));

  return {
    bookingCount: Number(bookingTotal?.count ?? 0),
    travelledBookings: Number(travelled?.bookings ?? 0),
    travelledSeats: Number(travelled?.seats ?? 0),
    travelledTotalPaise: Number(travelled?.totalPaise ?? 0),
    travelledPaidPaise: Number(travelled?.paidPaise ?? 0),
  };
}

export async function getBookingReportRows(
  range: ReportRange, query = "", basis: "booked" | "travel" = "booked",
) {
  const filters: SQL[] = [basis === "travel" ? travelDateRange(range) : createdAtRange(range)];
  if (query.trim()) {
    const q = query.trim();
    filters.push(or(
      ilike(booking.pnr, `%${q}%`),
      ilike(booking.primaryPhone, `%${q}%`),
      ilike(booking.primaryPassengerName, `%${q}%`),
    )!);
  }
  return db.select({
    pnr: booking.pnr, customer: booking.primaryPassengerName, phone: booking.primaryPhone,
    status: booking.status, totalPaise: booking.amountTotalPaise,
    paidPaise: booking.amountPaidPaise, paymentType: booking.paymentType,
    bookedAt: booking.createdAt, travelDate: trip.serviceDate,
    route: sql<string>`${route.origin} || ' -> ' || ${route.destination}`,
    bus: bus.displayName, pickup: booking.boardingName, bookedBy: agent.name,
    seats: sql<string>`(select string_agg(s.seat_number, ', ' order by s.sort_order)
      from ${bookingSeat} bs join ${seat} s on s.id = bs.seat_id
      where bs.booking_id = ${booking.id})`,
  }).from(booking).innerJoin(trip, eq(trip.id, booking.tripId))
    .innerJoin(route, eq(route.id, trip.routeId)).innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(agent, eq(agent.id, booking.createdByAgentId))
    .where(and(...filters)).orderBy(desc(booking.createdAt));
}

export async function getFinanceReportRows(range: ReportRange) {
  return db.select({
    pnr: booking.pnr, customer: booking.primaryPassengerName, phone: booking.primaryPhone,
    status: booking.status, totalPaise: booking.amountTotalPaise,
    paidPaise: booking.amountPaidPaise, paymentType: booking.paymentType,
    travelDate: trip.serviceDate,
    route: sql<string>`${route.origin} || ' -> ' || ${route.destination}`,
    bus: bus.displayName,
  }).from(booking).innerJoin(trip, eq(trip.id, booking.tripId))
    .innerJoin(route, eq(route.id, trip.routeId)).innerJoin(bus, eq(bus.id, trip.busId))
    .where(and(travelDateRange(range), ne(booking.status, "CANCELLED")))
    .orderBy(trip.serviceDate, booking.pnr);
}
