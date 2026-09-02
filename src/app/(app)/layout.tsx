import { redirect } from "next/navigation";
import {
  Bus, CalendarClock, LayoutDashboard, ListChecks, Route as RouteIcon,
  Ticket, Timer, Users,
} from "lucide-react";
import { getVerifiedSession, destroySession } from "@/server/auth";
import { AppShell } from "./AppShell";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { href: "/trips", label: "Book a ticket", icon: <Ticket size={16} /> },
  { href: "/holds", label: "Reserved seats", icon: <Timer size={16} /> },
  { href: "/bookings", label: "Bookings", icon: <ListChecks size={16} /> },
  { href: "/masters/buses", label: "Buses", icon: <Bus size={16} /> },
  { href: "/masters/routes", label: "Routes", icon: <RouteIcon size={16} /> },
  { href: "/masters/schedules", label: "Schedules", icon: <CalendarClock size={16} /> },
  { href: "/masters/agents", label: "Agents", icon: <Users size={16} /> },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  // A temporary password issued by a colleague grants exactly one privilege:
  // replacing itself. Enforced here so no page in the app can be reached around
  // it, including by typing a URL directly. The change-password page lives
  // outside this layout, so this cannot loop.
  if (session.mustChangePassword) redirect("/change-password?first=1");

  async function logout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <AppShell
      nav={NAV}
      session={{ name: session.name, email: session.email }}
      logout={
        <form action={logout}>
          <button type="submit"
            className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-800">
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
