import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { excelWorkbook, moneyPaise } from "@/lib/excel";
import { getTicketsForTrip, getTripHeader } from "@/server/services/ticket";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  await requireSession();
  const { tripId } = await params;
  const [header, tickets] = await Promise.all([
    getTripHeader(tripId),
    getTicketsForTrip(tripId),
  ]);
  if (!header) return new NextResponse("Trip not found", { status: 404 });

  const rows = tickets.map((ticket) => [
    ticket.pnr, ticket.customerName, ticket.customerPhone,
    ticket.seats.map((seat) => seat.seatNumber).join(", "),
    header.busName, header.registrationNo, ticket.paymentType,
    ticket.paymentStatus, ticket.status, moneyPaise(ticket.amountTotalPaise),
    moneyPaise(ticket.amountPaidPaise), ticket.boardingName ?? "—",
    ticket.droppingName ?? "—",
  ]);
  const title = `Passenger manifest ${header.routeCode} ${header.serviceDate}`;
  const html = excelWorkbook(title, [
    "PNR", "Customer name", "Phone", "Seat", "Bus", "Bus number",
    "Payment type", "Payment status", "Booking status", "Total", "Paid",
    "Pickup", "Drop",
  ], rows);

  return new NextResponse(html, { headers: {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="manifest-${header.routeCode}-${header.serviceDate}.xls"`,
  }});
}
