import Link from "next/link";
import { redirect } from "next/navigation";
import { Bus, CalendarRange, LayoutDashboard, Ticket, Route as RouteIcon, BarChart3 } from "lucide-react";
import { getSession, destroySession } from "@/server/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/book", label: "Book a ticket", icon: Ticket },
  { href: "/trips", label: "Trips", icon: CalendarRange },
  { href: "/masters/buses", label: "Buses", icon: Bus },
  { href: "/masters/routes", label: "Routes", icon: RouteIcon },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bus size={17} />
          </span>
          <span className="text-sm font-semibold text-ink-900">Counter</span>
        </div>

        <nav className="flex-1 px-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-50 hover:text-ink-900">
              <Icon size={16} className="text-ink-400" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <p className="truncate text-xs font-medium text-ink-800">{session.name}</p>
          <p className="mb-2 truncate text-[11px] text-ink-500">{session.email}</p>
          <form action={logout}>
            <button type="submit"
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-800">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
