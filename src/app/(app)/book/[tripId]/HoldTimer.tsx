"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Counts down to the server's `expiresAt`.
 *
 * The remaining time is computed against a *server-anchored* clock: we measure
 * the offset between the server's `now` and this device's clock once, then
 * apply it. A counter machine with a wrong clock would otherwise show a hold as
 * expired while it is still perfectly valid, or the reverse.
 */
export function HoldTimer({ expiresAt, serverNow, onExpire }: {
  expiresAt: string; serverNow: string; onExpire?: () => void;
}) {
  const [skewMs] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [remaining, setRemaining] = useState(() =>
    new Date(expiresAt).getTime() - (Date.now() + skewMs));

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const left = target - (Date.now() + skewMs);
      setRemaining(left);
      if (left <= 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, skewMs, onExpire]);

  const secs = Math.max(0, Math.floor(remaining / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const urgent = secs <= 60;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums",
      secs === 0 ? "bg-red-100 text-red-700"
        : urgent ? "bg-amber-100 text-amber-800"
        : "bg-emerald-50 text-emerald-700",
    )}>
      <Timer size={14} />
      {secs === 0 ? "Expired" : `${mm}:${ss}`}
    </span>
  );
}
