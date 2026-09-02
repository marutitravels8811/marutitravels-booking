import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Bus as BusIcon, Plus } from "lucide-react";
import { db } from "@/db";
import { bus, seat, seatLayout } from "@/db/schema";

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
      seatCount: sql<number>`(
        select count(*)::int from ${seat}
        where ${seat.layoutId} = ${bus.currentLayoutId} and ${seat.isActive}
      )`,
    })
    .from(bus)
    .leftJoin(seatLayout, eq(seatLayout.id, bus.currentLayoutId))
    .orderBy(desc(bus.isActive), bus.displayName);

  return (
    <div className="p-6">
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
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
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
                    <Link href={`/masters/buses/${b.id}`}
                      className="text-xs font-medium text-brand-600 hover:underline">
                      Edit seating
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
