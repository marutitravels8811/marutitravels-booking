import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Download, Pencil, Printer, Search, Ticket } from "lucide-react";
import { db } from "@/db";
import {
  agent, booking, bookingSeat, bus, route, seat, trip,
} from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";
import { CancelBookingButton } from "./CancelBookingButton";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash", ONLINE: "Online", PENDING: "Pay later",
};

export default async function BookingsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const filters: SQL[] = [];
  if (q) {
    filters.push(or(
      ilike(booking.pnr, `%${q}%`),
      ilike(booking.primaryPhone, `%${q}%`),
      ilike(booking.primaryPassengerName, `%${q}%`),
    )!);
  }
  if (sp.from) filters.push(gte(trip.serviceDate, sp.from));
  if (sp.to) filters.push(lte(trip.serviceDate, sp.to));

  const rows = await db
    .select({
      id: booking.id,
      pnr: booking.pnr,
      name: booking.primaryPassengerName,
      phone: booking.primaryPhone,
      amountTotalPaise: booking.amountTotalPaise,
      amountPaidPaise: booking.amountPaidPaise,
      paymentType: booking.paymentType,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      createdAt: booking.createdAt,
      boardingName: booking.boardingName,
      droppingName: booking.droppingName,
      serviceDate: trip.serviceDate,
      direction: trip.direction,
      origin: route.origin,
      destination: route.destination,
      busName: bus.displayName,
      bookedBy: agent.name,
      seatNumbers: sql<string>`(
        select string_agg(s.seat_number, ', ' order by s.sort_order)
        from ${bookingSeat} bs join ${seat} s on s.id = bs.seat_id
        where bs.booking_id = ${booking.id}
      )`,
    })
    .from(booking)
    .innerJoin(trip, eq(trip.id, booking.tripId))
    .innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(agent, eq(agent.id, booking.createdByAgentId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(booking.createdAt))
    .limit(100);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink-900">Bookings</h1>
            <p className="text-sm text-ink-500">
              Most recent first. Search by ticket number, phone or passenger name.
            </p>
          </div>
          <Link href={`/api/reports/export?kind=bookings&basis=travel&from=${sp.from ?? ""}&to=${sp.to ?? ""}&q=${encodeURIComponent(q)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Download size={15} /> Download Excel
          </Link>
        </div>
      </header>

      <form className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-end">
        <div className="sm:min-w-56 sm:flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-700">Search</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input id="q" name="q" defaultValue={q}
              placeholder="PNR, phone or name"
              className="w-full rounded-lg border border-[var(--border)] py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-700">Travel from</label>
          <input id="from" name="from" type="date" defaultValue={sp.from}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-700">to</label>
          <input id="to" name="to" type="date" defaultValue={sp.to}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <button type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Search
        </button>
        {(q || sp.from || sp.to) && (
          <Link href="/bookings" className="px-2 py-2 text-sm text-ink-600 hover:text-ink-900">Clear</Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <Ticket className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="text-sm font-medium text-ink-700">
            {q || sp.from || sp.to ? "Nothing matched that search" : "No bookings yet"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ticket</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Journey</th>
                <th className="px-4 py-2.5 font-medium">Seats</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Booked by</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((b) => (
                <tr key={b.id} className={b.status === "CANCELLED"
                  ? "bg-ink-50/60 text-ink-400" : "hover:bg-[var(--surface-2)]"}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-ink-900">{b.pnr}</span>
                    {b.status === "CANCELLED" && (
                      <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        Cancelled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">{b.name}</span>
                    <span className="block text-xs text-ink-500">{b.phone}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {journeyLabel(b.origin, b.destination, b.direction)}
                    <span className="block text-ink-500">
                      {b.serviceDate} · {b.busName}
                    </span>
                    {(b.boardingName || b.droppingName) && (
                      <span className="block text-ink-400">
                        {b.boardingName ?? "—"} → {b.droppingName ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{b.seatNumbers}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold text-ink-900">
                      {formatINR(b.amountTotalPaise)}
                    </span>
                    {b.amountPaidPaise < b.amountTotalPaise && (
                      <span className="block text-[11px] text-amber-700">
                        {formatINR(b.amountTotalPaise - b.amountPaidPaise)} due
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={
                      b.paymentStatus === "PAID"
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        : b.paymentStatus === "PARTIAL"
                        ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"}>
                      {PAYMENT_LABEL[b.paymentType] ?? b.paymentType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {b.bookedBy}
                    <span className="block text-ink-400">{formatDateTime(b.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/tickets/${b.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                        <Printer size={12} /> View booking
                      </Link>
                      {b.status !== "CANCELLED" && <CancelBookingButton bookingId={b.id} />}
                      {b.status !== "CANCELLED" && (
                        <Link href={`/bookings/${b.id}/edit`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-brand-700">
                          <Pencil size={12} /> Edit booking
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
