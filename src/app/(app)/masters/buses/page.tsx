import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { Bus as BusIcon, Plus } from "lucide-react";
import { db } from "@/db";
import { bus, seat, seatLayout, trip } from "@/db/schema";
import { RemoveMasterButton } from "../RemoveMasterButton";
import { removeBusAction } from "./actions";
import { BusRegistrationEditor } from "./BusRegistrationEditor";

export const dynamic = "force-dynamic";

export default async function BusesPage() {
  const rows = await db
    .select({
      id: bus.id,
      registrationNo: bus.registrationNo,
      displayName: bus.displayName,
      note: bus.note,
      isActive: bus.isActive,
      layoutVersion: seatLayout.version,
      layoutName: seatLayout.name,
      futureTripCount: sql<number>`(select count(*)::int from ${trip} t where t.bus_id = ${bus.id} and t.status = 'SCHEDULED' and t.service_date >= to_char(current_date, 'YYYY-MM-DD'))`,
      seatCount: sql<number>`(
        select count(*)::int from ${seat}
        where ${seat.layoutId} = ${bus.currentLayoutId} and ${seat.isActive}
      )`,
    })
    .from(bus)
    .leftJoin(seatLayout, eq(seatLayout.id, bus.currentLayoutId))
    .where(eq(bus.isActive, true)).orderBy(bus.displayName);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Buses</h1>
          <p className="text-sm text-ink-500">
            Each bus carries its own seat layout. Add or edit the seating any time.
          </p>
        </div>
        <Link href="/masters/buses/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
          <Plus size={15} /> Add bus
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <BusIcon className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="mb-1 text-sm font-medium text-ink-700">No buses yet</p>
          <p className="mb-4 text-xs text-ink-500">
            Add your first bus — the standard 38 sleeper + 5 cabin layout is one click away.
          </p>
          <Link href="/masters/buses/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> Add bus
          </Link>
        </div>
      ) : (
        <div>
          <div className="grid gap-3 md:hidden">
            {rows.map((b) => (
              <article key={b.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink-900">{b.displayName}</h2>
                    {b.note && <p className="mt-0.5 text-xs text-ink-500">{b.note}</p>}
                  </div>
                  <span className={b.isActive
                    ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                    : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500"}>
                    {b.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-xs">
                  <BusRegistrationEditor busId={b.id} initialValue={b.registrationNo} />
                  <div><span className="block text-ink-400">Berths</span><span className="font-medium tabular-nums text-ink-700">{b.seatCount}</span></div>
                  <div className="col-span-2"><span className="block text-ink-400">Layout</span><span className="font-medium text-ink-700">{b.layoutName ?? "—"}{b.layoutVersion ? ` · v${b.layoutVersion}` : ""}</span></div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--border)] pt-3">
                  <Link href={`/masters/buses/${b.id}`} className="text-xs font-medium text-brand-600 hover:underline">Edit seating</Link>
                  <RemoveMasterButton label="bus" id={b.id} futureTripCount={b.futureTripCount} onRemove={removeBusAction} />
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] md:block">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Bus</th>
                <th className="px-4 py-2.5 font-medium">Registration</th>
                <th className="px-4 py-2.5 font-medium">Layout</th>
                <th className="px-4 py-2.5 text-right font-medium">Berths</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((b) => (
                <tr key={b.id} className="transition hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {b.displayName}
                    {b.note && <span className="block text-xs font-normal text-ink-500">{b.note}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-600">{b.registrationNo}</td>
                  <td className="px-4 py-3 text-xs text-ink-600">
                    {b.layoutName ?? "—"}
                    {b.layoutVersion ? <span className="text-ink-400"> · v{b.layoutVersion}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-800">{b.seatCount}</td>
                  <td className="px-4 py-3">
                    <span className={b.isActive
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500"}>
                      {b.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/masters/buses/${b.id}`}
                        className="text-xs font-medium text-brand-600 hover:underline">Edit seating</Link>
                      <RemoveMasterButton label="bus" id={b.id} futureTripCount={b.futureTripCount} onRemove={removeBusAction} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
