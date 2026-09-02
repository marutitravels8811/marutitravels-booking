import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { Plus, Route as RouteIcon } from "lucide-react";
import { db } from "@/db";
import { boardingPoint, route } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const rows = await db.select({
    id: route.id, code: route.code, origin: route.origin,
    destination: route.destination, distanceKm: route.distanceKm,
    isActive: route.isActive,
    pickups: sql<number>`(select count(*)::int from ${boardingPoint} p
      where p.route_id = ${route.id} and p.kind = 'BOARDING' and p.is_active)`,
    drops: sql<number>`(select count(*)::int from ${boardingPoint} p
      where p.route_id = ${route.id} and p.kind = 'DROPPING' and p.is_active)`,
  }).from(route).orderBy(desc(route.isActive), route.code);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Routes</h1>
          <p className="text-sm text-ink-500">
            Where the buses run, and the pickup and drop points on each.
          </p>
        </div>
        <Link href="/masters/routes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus size={15} /> Add route
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <RouteIcon className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="mb-1 text-sm font-medium text-ink-700">No routes yet</p>
          <p className="mb-4 text-xs text-ink-500">Add the route your buses run.</p>
          <Link href="/masters/routes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> Add route
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Route</th>
                <th className="px-4 py-2.5 text-right font-medium">Distance</th>
                <th className="px-4 py-2.5 text-right font-medium">Pickups / Drops</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{r.code}</td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {r.origin} → {r.destination}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-600">
                    {r.distanceKm ? `${r.distanceKm} km` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-600">
                    {r.pickups} / {r.drops}
                  </td>
                  <td className="px-4 py-3">
                    <span className={r.isActive
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                      : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500"}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/masters/routes/${r.id}`}
                      className="text-xs font-medium text-brand-600 hover:underline">Edit</Link>
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
