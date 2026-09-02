import Link from "next/link";
import { eq } from "drizzle-orm";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { bus, route } from "@/db/schema";
import { listTripsForDate } from "@/server/services/trip";
import { serviceDateOf, formatTime } from "@/lib/time";
import { TripTools } from "./TripTools";

export const dynamic = "force-dynamic";

function shiftDate(d: string, days: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

export default async function TripsPage({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : serviceDateOf();

  const [trips, routes, buses] = await Promise.all([
    listTripsForDate(date),
    db.select({ id: route.id, code: route.code, origin: route.origin,
                destination: route.destination })
      .from(route).where(eq(route.isActive, true)).orderBy(route.code),
    db.select({ id: bus.id, displayName: bus.displayName,
                registrationNo: bus.registrationNo })
      .from(bus).where(eq(bus.isActive, true)).orderBy(bus.displayName),
  ]);

  return (
    <div className="p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Trips</h1>
          <p className="text-sm text-ink-500">
            Departures on {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>
        <TripTools date={date}
          routes={routes.map((r) => ({ id: r.id, label: `${r.code} · ${r.origin} → ${r.destination}` }))}
          buses={buses.map((b) => ({ id: b.id, label: `${b.displayName} (${b.registrationNo})` }))} />
      </header>

      <nav className="mb-4 flex items-center gap-2">
        <Link href={`/trips?date=${shiftDate(date, -1)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
          <ChevronLeft size={14} /> Previous
        </Link>
        <Link href={`/trips?date=${serviceDateOf()}`}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
          Today
        </Link>
        <Link href={`/trips?date=${shiftDate(date, 1)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
          Next <ChevronRight size={14} />
        </Link>
      </nav>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <CalendarRange className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="mb-1 text-sm font-medium text-ink-700">No trips on this date</p>
          <p className="text-xs text-ink-500">
            Generate them from a saved schedule, or add a single extra bus.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {trips.map((t) => {
            const sold = t.booked + t.held;
            const pct = Math.round((sold / Math.max(t.totalSeats, 1)) * 100);
            return (
              <article key={t.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">
                      {t.origin} → {t.destination}
                      <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
                        {t.direction === "ONWARD" ? "Onward" : "Return"}
                      </span>
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {t.busName} · {t.registrationNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink-900">
                      {formatTime(t.departureAt)}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      arr {formatTime(t.arrivalAt)}
                    </p>
                  </div>
                </div>

                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-600">
                    <strong className="tabular-nums text-ink-900">{t.available}</strong> free
                    <span className="mx-1.5 text-ink-300">·</span>
                    <span className="tabular-nums">{t.booked}</span> booked
                    {t.held > 0 && (
                      <>
                        <span className="mx-1.5 text-ink-300">·</span>
                        <span className="tabular-nums text-amber-700">{t.held}</span> held
                      </>
                    )}
                  </span>
                  {t.status === "SCHEDULED" ? (
                    <Link href={`/book/${t.id}`}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                      Open seat map
                    </Link>
                  ) : (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">
                      {t.status}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
