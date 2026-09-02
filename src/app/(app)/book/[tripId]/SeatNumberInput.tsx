"use client";

import { useState, useTransition } from "react";
import { Keyboard, Loader2 } from "lucide-react";
import { resolveSeatNumbersAction } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Type seat numbers instead of clicking them.
 *
 * At a busy counter an agent who knows the bus is faster on the keyboard than
 * with a mouse — "u7, l3, c1" and Enter beats hunting three targets on a map.
 * Unknown numbers are reported rather than silently dropped.
 */
export function SeatNumberInput({ tripId, onResolved, disabled }: {
  tripId: string;
  onResolved: (seatIds: string[]) => void;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  function submit() {
    if (!raw.trim()) return;
    setMessage(null);
    start(async () => {
      const res = await resolveSeatNumbersAction(tripId, raw);
      if (!res.ok || !res.data) {
        setMessage({ kind: "error", text: res.error ?? "Could not read those seat numbers." });
        return;
      }
      const { found, unknown } = res.data;
      if (found.length > 0) onResolved(found.map((f) => f.seatId));
      if (unknown.length > 0) {
        setMessage({ kind: "error",
          text: `Not on this bus: ${unknown.join(", ")}` });
      } else {
        setMessage({ kind: "ok", text: `Selected ${found.map((f) => f.seatNumber).join(", ")}` });
        setRaw("");
      }
    });
  }

  return (
    <div>
      <label htmlFor="seat-numbers"
        className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-700">
        <Keyboard size={13} className="text-ink-400" /> Type seat numbers
      </label>
      <div className="flex gap-2">
        <input id="seat-numbers" value={raw} disabled={disabled}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="U7, L3, C1"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm uppercase outline-none transition placeholder:normal-case focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50" />
        <button type="button" onClick={submit} disabled={pending || disabled || !raw.trim()}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40">
          {pending ? <Loader2 size={14} className="animate-spin" /> : "Add"}
        </button>
      </div>
      {message && (
        <p className={cn("mt-1 text-[11px]",
          message.kind === "error" ? "text-red-600" : "text-emerald-700")}>
          {message.text}
        </p>
      )}
      <p className="mt-1 text-[11px] text-ink-400">
        Separate with commas or spaces. Press Enter to add.
      </p>
    </div>
  );
}
