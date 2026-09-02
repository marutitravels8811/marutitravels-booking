import Link from "next/link";
import { sql } from "drizzle-orm";
import { Bus, Ticket, CalendarRange } from "lucide-react";
import { db } from "@/db";
import { bus, booking, trip } from "@/db/schema";
import { getSession } from "@/server/auth";
import { serviceDateOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  const today = serviceDateOf();

  const [counts] = await db.select({
    buses: sql<number>`(select count(*)::int from ${bus} where ${bus.isActive})`,
    tripsToday: sql<number>`(select count(*)::int from ${trip} where ${trip.serviceDate} = ${today})`,
    bookingsToday: sql<number>`(select count(*)::int from ${booking}
      where ${booking.createdAt}::date = ${today}::date)`,
  }).from(sql`(select 1) as _`);

  const cards = [
    { label: "Active buses", value: counts.buses, href: "/masters/buses", icon: Bus },
    { label: "Trips today", value: counts.tripsToday, href: "/trips", icon: CalendarRange },
    { label: "Bookings today", value: counts.bookingsToday, href: "/bookings", icon: Ticket },
  ];

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900">
        Good day, {session?.name.split(" ")[0]}
      </h1>
      <p className="mb-5 text-sm text-ink-500">{today}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, href, icon: Icon }) => (
          <Link key={label} href={href}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-brand-300">
            <Icon size={18} className="mb-3 text-ink-400" />
            <p className="text-2xl font-bold tabular-nums text-ink-900">{value}</p>
            <p className="text-xs text-ink-500">{label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-ink-600">
        <p className="mb-1 font-medium text-ink-800">Next: routes, trips and the booking flow</p>
        <p className="text-xs">
          Bus and seat-layout management is live. Add your buses first — trips and
          the hold-then-confirm booking screen build on top of their layouts.
        </p>
      </div>
    </div>
  );
}
