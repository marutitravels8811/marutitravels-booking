import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireSession } from "@/server/auth";
import { getTicket } from "@/server/services/ticket";
import { getOfficeDetails } from "@/lib/office";
import { Ticket } from "@/components/ticket/Ticket";
import { PrintSheet } from "@/components/ticket/PrintSheet";
import { CancelBookingButton } from "@/app/(app)/bookings/CancelBookingButton";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: { params: Promise<{ bookingId: string }> }) {
  await requireSession();
  const { bookingId } = await params;

  const ticket = await getTicket(bookingId);
  if (!ticket) notFound();
  const office = getOfficeDetails();

  return (
    <div className="p-4 sm:p-6">
      <Link href="/bookings"
        className="no-print mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Bookings
      </Link>

      <PrintSheet count={1} defaultFormat="a5"
        subtitle={`${ticket.pnr} · ${ticket.customerName} · seat ${ticket.seats.map((s) => s.seatNumber).join(", ")}`}>
        <Ticket ticket={ticket} office={office} />
      </PrintSheet>
      {ticket.status !== "CANCELLED" && (
        <div className="no-print mt-4 flex justify-end">
          <Link href={`/bookings/${ticket.bookingId}/edit`}
            className="mr-2 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50">
            <Pencil size={13} /> Edit booking
          </Link>
          <CancelBookingButton bookingId={ticket.bookingId} />
        </div>
      )}
    </div>
  );
}
