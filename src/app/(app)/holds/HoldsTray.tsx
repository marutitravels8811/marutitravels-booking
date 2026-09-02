"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, RefreshCw, Timer, User } from "lucide-react";
import { HoldTimer } from "@/app/(app)/book/[tripId]/HoldTimer";
import { formatTime } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";
import { cn } from "@/lib/utils";
import {
  listHoldsAction, releaseHoldFromTrayAction, extendHoldFromTrayAction,
  type HoldSummary,
} from "./actions";

const POLL_MS = 5000;

export function HoldsTray({ initial, serverNow }: {
  initial: HoldSummary[]; serverNow: string;
}) {
  const router = useRouter();
  const [holds, setHolds] = useState(initial);
  const [now, setNow] = useState(serverNow);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await listHoldsAction();
        setHolds(r.holds);
        setNow(r.serverNow);
      } catch { /* transient; the next tick recovers */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const mine = holds.filter((h) => h.isMine);
  const others = holds.filter((h) => !h.isMine);

  if (holds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
        <Timer className="mx-auto mb-3 text-ink-300" size={28} />
        <p className="mb-1 text-sm font-medium text-ink-700">No seats are reserved right now</p>
        <p className="text-xs text-ink-500">
          Reserved seats appear here so you can serve the next customer and come
          back to confirm once payment is settled.
        </p>
      </div>
    );
  }

  function act(holdId: string, fn: () => Promise<unknown>) {
    setBusyId(holdId);
    start(async () => {
      await fn();
      const r = await listHoldsAction();
      setHolds(r.holds);
      setNow(r.serverNow);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Your reservations"
        subtitle="Confirm these once the customer has paid."
        holds={mine} now={now} busyId={busyId} pending={pending}
        onRelease={(id) => act(id, () => releaseHoldFromTrayAction(id))}
        onExtend={(id) => act(id, () => extendHoldFromTrayAction(id))}
        onExpire={() => listHoldsAction().then((r) => { setHolds(r.holds); setNow(r.serverNow); })}
      />
      {others.length > 0 && (
        <Section title="Held by other agents"
          subtitle="Visible so you know why a seat is unavailable. Release only if the colleague has stepped away."
          holds={others} now={now} busyId={busyId} pending={pending}
          onRelease={(id) => {
            const reason = window.prompt(
              "Releasing another agent's reservation is recorded in the audit log.\nWhy are you releasing it?");
            if (reason?.trim()) act(id, () => releaseHoldFromTrayAction(id, reason.trim()));
          }}
          onExtend={null}
          onExpire={() => listHoldsAction().then((r) => { setHolds(r.holds); setNow(r.serverNow); })}
        />
      )}
    </div>
  );
}

function Section({
  title, subtitle, holds, now, busyId, pending, onRelease, onExtend, onExpire,
}: {
  title: string; subtitle: string; holds: HoldSummary[]; now: string;
  busyId: string | null; pending: boolean;
  onRelease: (id: string) => void;
  onExtend: ((id: string) => void) | null;
  onExpire: () => void;
}) {
  if (holds.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
      <p className="mb-3 text-xs text-ink-500">{subtitle}</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {holds.map((h) => (
          <article key={h.holdId}
            className={cn(
              "rounded-xl border bg-[var(--surface)] p-4",
              h.isMine ? "border-amber-200" : "border-[var(--border)]",
            )}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {h.seatNumbers.join(", ")}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {journeyLabel(h.origin, h.destination, h.direction)} · {h.serviceDate} · {formatTime(h.departureAt)}
                </p>
                <p className="text-xs text-ink-500">{h.busName}</p>
              </div>
              <HoldTimer expiresAt={h.expiresAt} serverNow={now} onExpire={onExpire} />
            </div>

            {(h.provisionalName || h.provisionalPhone) && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-600">
                <User size={12} className="text-ink-400" />
                {h.provisionalName ?? "—"}
                {h.provisionalPhone && <span className="text-ink-400">· {h.provisionalPhone}</span>}
              </p>
            )}
            {!h.isMine && (
              <p className="mb-2 text-xs text-ink-500">Held by {h.agentName}</p>
            )}

            <div className="flex items-center gap-2">
              {h.isMine && (
                <Link href={`/book/${h.tripId}?hold=${h.holdId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                  Confirm booking <ArrowRight size={13} />
                </Link>
              )}
              {onExtend && (
                <button type="button" onClick={() => onExtend(h.holdId)}
                  disabled={pending || h.extensionCount >= 2}
                  title={h.extensionCount >= 2 ? "Already extended twice" : undefined}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40">
                  <RefreshCw size={12} /> More time
                </button>
              )}
              <button type="button" onClick={() => onRelease(h.holdId)} disabled={pending}
                className="ml-auto text-xs text-red-600 hover:underline disabled:opacity-40">
                {busyId === h.holdId && pending
                  ? <Loader2 size={13} className="animate-spin" /> : "Release"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
