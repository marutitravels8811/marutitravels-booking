"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Date navigation for the trip list.
 *
 * The arrows are for the common case of nudging a day either way; the date
 * field is for everything else. Stepping one day at a time to reach a booking
 * three weeks out is not a reasonable ask of someone with a customer waiting.
 */
export function DatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    start(() => router.push(`/trips?date=${next}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => go(shift(date, -1))} disabled={pending}
        aria-label="Previous day"
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
        <ChevronLeft size={15} />
        <span className="hidden sm:inline">Previous</span>
      </button>

      <label className="relative inline-flex items-center">
        <CalendarDays size={15}
          className="pointer-events-none absolute left-2.5 text-ink-400" />
        <span className="sr-only">Travel date</span>
        <input type="date" value={date} disabled={pending}
          onChange={(e) => go(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-2.5 text-sm font-medium text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-50" />
      </label>

      <button type="button" onClick={() => go(shift(date, 1))} disabled={pending}
        aria-label="Next day"
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
        <span className="hidden sm:inline">Next</span>
        <ChevronRight size={15} />
      </button>

      {date !== today && (
        <button type="button" onClick={() => go(today)} disabled={pending}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50">
          Today
        </button>
      )}

      {pending && <Loader2 size={15} className="animate-spin text-ink-400" />}
    </div>
  );
}
