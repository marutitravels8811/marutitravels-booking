import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { boardingPoint, bus, route, seatLayout, trip } from "@/db/schema";
import { getActiveHold, getTripSeatStates } from "@/server/services/seat-hold";
import { requireSession } from "@/server/auth";
import { BookingScreen } from "./BookingScreen";

export const dynamic = "force-dynamic";

export default async function BookTripPage({
  params, searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ hold?: string }>;
}) {
  const { tripId } = await params;
  const { hold: holdId } = await searchParams;
  const session = await requireSession();

  const [row] = await db
    .select({
      id: trip.id,
      direction: trip.direction,
      serviceDate: trip.serviceDate,
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
      status: trip.status,
      routeId: trip.routeId,
      origin: route.origin,
      destination: route.destination,
      busName: bus.displayName,
      registrationNo: bus.registrationNo,
      fareSingleSofaPaise: bus.fareSingleSofaPaise,
      fareDoubleSofaPaise: bus.fareDoubleSofaPaise,
      fareCabinPaise: bus.fareCabinPaise,
      sleeperRows: seatLayout.sleeperRows,
      sleeperCols: seatLayout.sleeperCols,
      cabinCols: seatLayout.cabinCols,
    })
    .from(trip)
    .innerJoin(route, eq(route.id, trip.routeId))
    .innerJoin(bus, eq(bus.id, trip.busId))
    .innerJoin(seatLayout, eq(seatLayout.id, trip.layoutId))
    .where(eq(trip.id, tripId))
    .limit(1);

  if (!row) notFound();

  const [{ seats }, points, resumed] = await Promise.all([
    getTripSeatStates(tripId),
    db.select({ id: boardingPoint.id, name: boardingPoint.name, kind: boardingPoint.kind })
      .from(boardingPoint)
      .where(and(eq(boardingPoint.routeId, row.routeId), eq(boardingPoint.isActive, true)))
      .orderBy(boardingPoint.sequence),
    holdId ? getActiveHold(holdId, session.agentId) : Promise.resolve(null),
  ]);

  if (row.status !== "SCHEDULED") {
    return (
      <div className="p-6">
        <Back date={row.serviceDate} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
          <p className="text-sm font-medium text-amber-900">
            This trip is {row.status.toLowerCase()} and cannot be booked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Back date={row.serviceDate} />
      <BookingScreen
        agentId={session.agentId}
        trip={{
          id: row.id,
          origin: row.origin,
          destination: row.destination,
          direction: row.direction,
          serviceDate: row.serviceDate,
          departureAt: row.departureAt.toISOString(),
          arrivalAt: row.arrivalAt.toISOString(),
          busName: row.busName,
          registrationNo: row.registrationNo,
          sleeperRows: row.sleeperRows,
          sleeperCols: row.sleeperCols,
          cabinCols: row.cabinCols,
          fareSingleSofaPaise: row.fareSingleSofaPaise,
          fareDoubleSofaPaise: row.fareDoubleSofaPaise,
          fareCabinPaise: row.fareCabinPaise,
        }}
        initialSeats={seats}
        resume={resumed && resumed.isMine && resumed.tripId === tripId ? {
          holdId: resumed.holdId,
          expiresAt: resumed.expiresAt.toISOString(),
          serverNow: new Date().toISOString(),
          seatIds: resumed.seatIds,
          provisionalName: resumed.provisionalName,
          provisionalPhone: resumed.provisionalPhone,
        } : null}
        points={points.map((p) => ({
          id: p.id, name: p.name, kind: p.kind as "BOARDING" | "DROPPING",
        }))}
      />
    </div>
  );
}

function Back({ date }: { date: string }) {
  return (
    <Link href={`/trips?date=${date}`}
      className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
      <ChevronLeft size={14} /> Trips
    </Link>
  );
}
