import Link from "next/link";
import { eq } from "drizzle-orm";
import { Wand2 } from "lucide-react";
import { db } from "@/db";
import { bus, route } from "@/db/schema";
import { requireSession } from "@/server/auth";
import { listSchedules } from "@/server/services/schedule";
import { serviceDateOf } from "@/lib/time";
import { SchedulesScreen } from "./SchedulesScreen";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  await requireSession();

  const [schedules, routes, buses] = await Promise.all([
    listSchedules(),
    db.select({ id: route.id, code: route.code, origin: route.origin,
                destination: route.destination })
      .from(route).where(eq(route.isActive, true)).orderBy(route.code),
    db.select({ id: bus.id, displayName: bus.displayName,
                registrationNo: bus.registrationNo })
      .from(bus).where(eq(bus.isActive, true)).orderBy(bus.displayName),
  ]);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Schedules</h1>
          <p className="text-sm text-ink-500">
            The standing timetable. Trips are generated from these.
          </p>
        </div>
        <Link href="/trips"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
          <Wand2 size={15} /> Generate trips
        </Link>
      </header>

      <SchedulesScreen
        today={serviceDateOf()}
        schedules={schedules.map((s) => ({
          ...s,
          validFrom: s.validFrom.toISOString().slice(0, 10),
          validTo: s.validTo ? s.validTo.toISOString().slice(0, 10) : null,
        }))}
        routes={routes.map((r) => ({
          id: r.id, label: `${r.code} · ${r.origin} → ${r.destination}` }))}
        buses={buses.map((b) => ({
          id: b.id, label: `${b.displayName} (${b.registrationNo})` }))}
      />
    </div>
  );
}
