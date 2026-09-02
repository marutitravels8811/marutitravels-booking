"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bus, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({
  nav, session, logout, children,
}: {
  nav: { href: string; label: string; icon: React.ReactNode }[];
  session: { name: string; email: string };
  logout: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /**
   * The drawer is open only while we are still on the page it was opened from,
   * so navigating anywhere closes it. Deriving that from the pathname avoids
   * a setState-in-effect and the extra render pass it would cost — and it
   * closes on browser Back too, which an onClick handler would miss.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  // don't let the page scroll behind an open drawer
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const navList = (
    <nav className="flex-1 px-2">
      {nav.map(({ href, label, icon }) => (
        <Link key={href} href={href}
          aria-current={isCurrent(href) ? "page" : undefined}
          className={cn(
            "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition sm:py-2",
            isCurrent(href)
              ? "bg-brand-50 font-medium text-brand-800"
              : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
          )}>
          <span className={isCurrent(href) ? "text-brand-600" : "text-ink-400"}>
            {icon}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-[var(--border)] p-3">
      <p className="truncate text-xs font-medium text-ink-800">{session.name}</p>
      <p className="mb-2 truncate text-[11px] text-ink-500">{session.email}</p>
      {logout}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 lg:hidden">
        <button type="button" onClick={() => setOpen(true)}
          aria-label="Open menu" aria-expanded={open}
          className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100">
          <Menu size={20} />
        </button>
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bus size={15} />
          </span>
          <span className="text-sm font-semibold text-ink-900">Counter</span>
        </span>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/40" />
          <div role="dialog" aria-modal="true" aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col bg-[var(--surface)] shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Bus size={17} />
                </span>
                <span className="text-sm font-semibold text-ink-900">Counter</span>
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
                className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
                <X size={18} />
              </button>
            </div>
            {navList}
            {footer}
          </div>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="no-print hidden w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bus size={17} />
          </span>
          <span className="text-sm font-semibold text-ink-900">Counter</span>
        </div>
        {navList}
        {footer}
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
