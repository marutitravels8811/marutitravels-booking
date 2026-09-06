import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Ticket as TicketIcon } from "lucide-react";
import { requireSession } from "@/server/auth";
import { getTicketsForTrip, getTripHeader } from "@/server/services/ticket";
import { getOfficeDetails } from "@/lib/office";
import { formatTime } from "@/lib/time";
import { journeyLabel, directionLabel } from "@/lib/journey";
import { Ticket } from "@/components/ticket/Ticket";
import { PrintSheet } from "@/components/ticket/PrintSheet";

export const dynamic = "force-dynamic";

export default async function TripTicketsPage({
  params, searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  await requireSession();
  const { tripId } = await params;
  const { cancelled } = await searchParams;
  const includeCancelled = cancelled === "1";

  const [header, tickets] = await Promise.all([
    getTripHeader(tripId),
    getTicketsForTrip(tripId, { includeCancelled }),
  ]);
  if (!header) notFound();
  const office = await getOfficeDetails();

  const seatsSold = tickets.reduce((n, t) => n + t.seats.length, 0);

  return (
    <div className="p-4 sm:p-6">
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href={`/trips?date=${header.serviceDate}`}
          className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
          <ChevronLeft size={14} /> Trips
        </Link>
        <Link href={`/trips/${tripId}/tickets?cancelled=${includeCancelled ? "0" : "1"}`}
          className="text-xs text-brand-600 hover:underline">
          {includeCancelled ? "Hide cancelled" : "Include cancelled"}
        </Link>
      </div>

      <header className="no-print mb-4">
        <h1 className="text-lg font-semibold text-ink-900">
          Tickets · {journeyLabel(header.origin, header.destination, header.direction)}
        </h1>
        <p className="text-sm text-ink-500">
          {header.serviceDate} · {formatTime(header.departureAt)} ·{" "}
          {header.busName} ({header.registrationNo}) ·{" "}
          {directionLabel(header.direction)}
        </p>
        <Link href={`/api/trips/${tripId}/manifest`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50">
          <Download size={14} /> Download passenger manifest
        </Link>
      </header>

      {tickets.length === 0 ? (
        <div className="no-print rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <TicketIcon className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="text-sm font-medium text-ink-700">Nothing booked on this trip yet</p>
        </div>
      ) : (
        <PrintSheet count={tickets.length}
          subtitle={`${seatsSold} of ${header.totalSeats} berths sold · ordered by seat, matching the passenger chart`}>
          {tickets.map((t) => (
            <Ticket key={t.bookingId} ticket={t} office={office} />
          ))}
        </PrintSheet>
      )}
    </div>
  );
}
