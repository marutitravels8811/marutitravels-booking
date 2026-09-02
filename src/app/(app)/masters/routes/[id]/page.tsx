import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { boardingPoint, route } from "@/db/schema";
import { RouteForm } from "../RouteForm";

export const dynamic = "force-dynamic";

export default async function EditRoutePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(route).where(eq(route.id, id)).limit(1);
  if (!row) notFound();

  const points = await db.select().from(boardingPoint)
    .where(and(eq(boardingPoint.routeId, id), eq(boardingPoint.isActive, true)))
    .orderBy(boardingPoint.kind, boardingPoint.sequence);

  return (
    <div className="p-6">
      <Link href="/masters/routes"
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800">
        <ChevronLeft size={14} /> Routes
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-ink-900">
        {row.origin} → {row.destination}
      </h1>
      <p className="mb-5 font-mono text-xs text-ink-500">{row.code}</p>

      <RouteForm initial={{
        id: row.id, code: row.code, origin: row.origin,
        destination: row.destination,
        distanceKm: row.distanceKm ? String(row.distanceKm) : "",
        defaultDurationMin: row.defaultDurationMin ? String(row.defaultDurationMin) : "",
        isActive: row.isActive,
        points: points.map((p) => ({
          id: p.id, key: p.id, name: p.name, address: p.address ?? "",
          kind: p.kind as "BOARDING" | "DROPPING",
          sequence: p.sequence, offsetMinutes: p.offsetMinutes,
        })),
      }} />
    </div>
  );
}
