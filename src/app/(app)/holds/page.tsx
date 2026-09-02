import { requireSession } from "@/server/auth";
import { listActiveHolds } from "@/server/services/seat-hold";
import { HoldsTray } from "./HoldsTray";

export const dynamic = "force-dynamic";

export default async function HoldsPage() {
  const session = await requireSession();
  const rows = await listActiveHolds(session.agentId);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-ink-900">Reserved seats</h1>
        <p className="text-sm text-ink-500">
          Seats held but not yet paid for. Serve the next customer and come back
          to confirm — the reservation is safe until its timer runs out.
        </p>
      </header>

      <HoldsTray
        serverNow={new Date().toISOString()}
        initial={rows.map((h) => ({
          holdId: h.holdId, tripId: h.tripId, agentName: h.agentName,
          isMine: h.isMine, expiresAt: h.expiresAt.toISOString(),
          extensionCount: h.extensionCount,
          provisionalName: h.provisionalName, provisionalPhone: h.provisionalPhone,
          seatNumbers: h.seatNumbers, serviceDate: h.serviceDate,
          direction: h.direction, departureAt: h.departureAt.toISOString(),
          origin: h.origin, destination: h.destination, busName: h.busName,
        }))}
      />
    </div>
  );
}
