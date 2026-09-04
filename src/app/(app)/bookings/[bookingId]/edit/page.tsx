import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { requireSession } from "@/server/auth";
import {
  getEditableBooking, getEditableTripPoints, getEditableTripSeats, listEditableTrips,
} from "@/server/services/booking";
import { EditBookingForm } from "./EditBookingForm";

export const dynamic = "force-dynamic";

export default async function EditBookingPage({
  params,
}: { params: Promise<{ bookingId: string }> }) {
  await requireSession();
  const { bookingId } = await params;
  const [booking, trips] = await Promise.all([
    getEditableBooking(bookingId), listEditableTrips(),
  ]);
  if (!booking) notFound();
  const [currentSeats, points] = await Promise.all([
    getEditableTripSeats(booking.tripId), getEditableTripPoints(booking.tripId),
  ]);
  const currentTrip = trips.find((t) => t.id === booking.tripId);
  if (!currentTrip) notFound();

  return (
    <div className="p-4 sm:p-6">
      <Link href={`/tickets/${booking.id}`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Ticket {booking.pnr}
      </Link>
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-ink-900">Edit booking</h1>
        <p className="text-sm text-ink-500">
          Change customer details, travel date, route, or seats for this booking.
        </p>
      </header>
      <EditBookingForm
        booking={booking}
        trips={trips.map((t) => ({
          ...t, departureAt: t.departureAt.toISOString(), arrivalAt: t.arrivalAt.toISOString(),
        }))}
        initialSeats={currentSeats}
        initialPoints={points}
      />
    </div>
  );
}
