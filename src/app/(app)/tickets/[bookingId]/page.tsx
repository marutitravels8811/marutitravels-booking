import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/server/auth";
import { getTicket } from "@/server/services/ticket";
import { getOfficeDetails } from "@/lib/office";
import { Ticket } from "@/components/ticket/Ticket";
import { PrintSheet } from "@/components/ticket/PrintSheet";

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
    </div>
  );
}
