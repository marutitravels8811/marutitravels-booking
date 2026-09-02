"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, Loader2, Lock, PauseCircle, Printer, RefreshCw,
  Ticket, X,
} from "lucide-react";
import { SeatMap, type SeatVisualState } from "@/components/seat-map/SeatMap";
import type { SeatLike } from "@/components/seat-map/geometry";
import { formatINR } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HoldTimer } from "./HoldTimer";
import { SeatNumberInput } from "./SeatNumberInput";
import {
  fetchSeatsAction, holdSeatsAction, releaseHoldAction, extendHoldAction,
  confirmBookingAction, parkHoldAction,
} from "./actions";
import type { SeatStateRow } from "@/server/services/seat-hold";
import {
  toggleSeat as toggleSeatRule, addSeats as addSeatsRule, removeSeat,
  type SplitPrompt,
} from "@/lib/seat-selection";

const POLL_MS = 3000;

export interface TripHeader {
  id: string;
  origin: string;
  destination: string;
  direction: "ONWARD" | "RETURN";
  serviceDate: string;
  departureAt: string;
  arrivalAt: string;
  busName: string;
  registrationNo: string;
  sleeperRows: number;
  sleeperCols: number;
  cabinCols: number;
  fareSingleSofaPaise: number;
  fareDoubleSofaPaise: number;
  fareCabinPaise: number;
}

export interface PointOption { id: string; name: string; kind: "BOARDING" | "DROPPING" }

export interface ResumableHold {
  holdId: string;
  expiresAt: string;
  serverNow: string;
  seatIds: string[];
  provisionalName: string | null;
  provisionalPhone: string | null;
}

interface Props {
  trip: TripHeader;
  initialSeats: SeatStateRow[];
  points: PointOption[];
  agentId: string;
  /** a still-live reservation being picked back up, from ?hold= */
  resume?: ResumableHold | null;
}

type Phase = "SELECTING" | "HELD" | "DONE";

export function BookingScreen({
  trip, initialSeats, points, agentId, resume,
}: Props) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatStateRow[]>(initialSeats);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(resume?.seatIds ?? []));
  const [phase, setPhase] = useState<Phase>(resume ? "HELD" : "SELECTING");
  const [hold, setHold] = useState<{ holdId: string; expiresAt: string; serverNow: string } | null>(
    resume
      ? { holdId: resume.holdId, expiresAt: resume.expiresAt, serverNow: resume.serverNow }
      : null);
  /** the name typed when the seats were parked, pre-filled on return */
  const [customerHint] = useState(() => ({
    name: resume?.provisionalName ?? "",
    phone: resume?.provisionalPhone ?? "",
  }));
  const [conflict, setConflict] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number } | null>(null);
  const [holdName, setHoldName] = useState("");
  const [holdPhone, setHoldPhone] = useState("");
  const [splitPrompt, setSplitPrompt] = useState<SplitPrompt | null>(null);

  const seatById = new Map(seats.map((s) => [s.seatId, s]));

  const defaultFareFor = useCallback((s: SeatStateRow) =>
    s.berthType === "CABIN" ? trip.fareCabinPaise
      : s.berthType === "SLEEPER_SINGLE" ? trip.fareSingleSofaPaise
      : trip.fareDoubleSofaPaise, [trip]);

  /**
   * Ingest a fresh seat snapshot.
   *
   * Selection pruning happens here rather than in a separate effect watching
   * `seats`: a seat another agent just took must stop being selected, and doing
   * that where the data actually arrives avoids a second render pass.
   */
  const applySnapshot = useCallback((next: SeatStateRow[]) => {
    setSeats(next);
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(next.map((s) => [s.seatId, s]));
      const kept = new Set<string>();
      for (const id of prev) {
        const s = byId.get(id);
        if (!s) continue;
        // seats under our own live hold stay selected; only free seats can be
        // pruned, and only while still choosing
        const ours = s.status === "HELD" && s.heldByAgentId === agentId;
        if (ours || (s.status === "AVAILABLE" && s.isActive)) kept.add(id);
      }
      return kept.size === prev.size ? prev : kept;
    });
  }, [agentId]);

  const refresh = useCallback(async () => {
    try {
      const snap = await fetchSeatsAction(trip.id);
      applySnapshot(snap.seats);
    } catch { /* a dropped poll is harmless; the next one recovers */ }
  }, [trip.id, applySnapshot]);

  /* live seat map — polling, because correctness never depends on push */
  useEffect(() => {
    if (phase === "DONE") return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, phase]);

  function stateOf(s: SeatLike): SeatVisualState {
    const row = seatById.get((s as unknown as SeatStateRow).seatId);
    if (!row) return "AVAILABLE";
    if (!row.isActive) return "BLOCKED";
    if (conflict.includes(row.seatNumber)) return "BLOCKED";
    if (row.status === "BOOKED") return "BOOKED";
    if (row.status === "BLOCKED") return "BLOCKED";
    if (row.status === "HELD") {
      if (hold && row.holdId === hold.holdId) return "HELD_BY_ME";
      return row.heldByAgentId === agentId ? "HELD_BY_ME" : "HELD_BY_OTHER";
    }
    return selected.has(row.seatId) ? "SELECTED" : "AVAILABLE";
  }

  function titleOf(s: SeatLike): string {
    const row = seatById.get((s as unknown as SeatStateRow).seatId);
    if (!row) return s.seatNumber;
    const price = formatINR(defaultFareFor(row));
    if (row.status === "BOOKED") return `${row.seatNumber} · booked`;
    if (row.status === "HELD" && row.heldByAgentName) {
      return `${row.seatNumber} · held by ${row.heldByAgentName}`;
    }
    if (!row.isActive) return `${row.seatNumber} · not in service`;
    return `${row.seatNumber} · ${price}`;
  }

  function toggleSeat(seatId: string) {
    if (phase !== "SELECTING") return;
    setConflict([]);
    const outcome = toggleSeatRule(seats, selected, seatId);
    if (outcome.confirmSplit) { setSplitPrompt(outcome.confirmSplit); return; }
    setSelected(outcome.selected);
  }

  function addSeatsByNumber(ids: string[]) {
    setConflict([]);
    setSelected((prev) => addSeatsRule(seats, prev, ids));
  }

  function confirmSplit() {
    if (!splitPrompt) return;
    setSelected((prev) => removeSeat(prev, splitPrompt.seatId));
    setSplitPrompt(null);
  }

  function doHold() {
    setError(null); setConflict([]);
    start(async () => {
      const res = await holdSeatsAction({
        tripId: trip.id, seatIds: [...selected],
        provisionalName: holdName, provisionalPhone: holdPhone,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not reserve those seats.");
        setConflict(res.conflictingSeats ?? []);
        await refresh();
        return;
      }
      setHold({ holdId: res.data.holdId, expiresAt: res.data.expiresAt,
                serverNow: res.data.serverNow });
      setPhase("HELD");
      await refresh();
    });
  }

  function doRelease() {
    if (!hold) return;
    start(async () => {
      await releaseHoldAction(hold.holdId);
      setHold(null); setPhase("SELECTING"); setSelected(new Set()); setError(null);
      await refresh();
    });
  }

  function doExtend() {
    if (!hold) return;
    start(async () => {
      const res = await extendHoldAction(hold.holdId);
      if (!res.ok || !res.data) { setError(res.error ?? "Could not extend."); return; }
      setHold({ holdId: hold.holdId, expiresAt: res.data.expiresAt,
                serverNow: res.data.serverNow });
    });
  }

  const selectedRows = [...selected]
    .map((id) => seatById.get(id))
    .filter((s): s is SeatStateRow => !!s);

  if (phase === "DONE" && result) {
    return (
      <BookingDone result={result} onNew={() => {
        setResult(null); setHold(null); setSelected(new Set());
        setPhase("SELECTING"); router.refresh();
      }} />
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        <TripBar trip={trip} />

        {error && (
          <div role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{error}</p>
              {conflict.length > 0 && (
                <p className="mt-1 text-xs">
                  The map has been refreshed — {conflict.join(", ")} shown in red
                  {conflict.length === 1 ? " is" : " are"} no longer free.
                </p>
              )}
            </div>
          </div>
        )}

        <SeatMap
          seats={seats as unknown as SeatLike[]}
          sleeperRows={trip.sleeperRows}
          sleeperCols={trip.sleeperCols}
          cabinCols={trip.cabinCols}
          stateOf={stateOf}
          titleOf={titleOf}
          onSeatClick={phase === "SELECTING"
            ? (s) => toggleSeat((s as unknown as SeatStateRow).seatId)
            : undefined}
          disabledSeat={(s) => {
            const row = seatById.get((s as unknown as SeatStateRow).seatId);
            return phase !== "SELECTING" || !row || row.status !== "AVAILABLE" || !row.isActive;
          }}
        />
      </div>

      {/* on a phone the panel sits above the map: it holds the action, and the
          map is a large scroll target that would otherwise bury it */}
      <aside className="order-first flex flex-col gap-4 xl:order-none">
        {phase === "SELECTING" && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-800">Choose seats</h2>
            <SeatNumberInput tripId={trip.id} onResolved={addSeatsByNumber} />

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <SelectedList rows={selectedRows} fareOf={defaultFareFor}
                onRemove={toggleSeat} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
              <div>
                <label htmlFor="hold-name" className="mb-1 block text-[11px] font-medium text-ink-600">
                  Customer name <span className="text-ink-400">(optional)</span>
                </label>
                <input id="hold-name" value={holdName}
                  onChange={(e) => setHoldName(e.target.value)}
                  placeholder="So you recognise it later"
                  className="w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="hold-phone" className="mb-1 block text-[11px] font-medium text-ink-600">
                  Phone <span className="text-ink-400">(optional)</span>
                </label>
                <input id="hold-phone" value={holdPhone} inputMode="tel"
                  onChange={(e) => setHoldPhone(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs outline-none focus:border-brand-500" />
              </div>
            </div>

            <button type="button" onClick={doHold}
              disabled={pending || selected.size === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40">
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Reserve {selected.size > 0 ? `${selected.size} seat${selected.size > 1 ? "s" : ""}` : "seats"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              Reserving holds the seats for you while payment is arranged. You
              can serve the next customer and come back — the reservation waits
              for you under <strong className="font-medium text-ink-700">Reserved seats</strong>.
            </p>
          </section>
        )}

        {phase === "HELD" && hold && (
          <ConfirmPanel
            hold={hold} rows={selectedRows} points={points}
            initialName={customerHint.name} initialPhone={customerHint.phone}
            defaultFareFor={defaultFareFor}
            onRelease={doRelease}
            onExtend={doExtend}
            onExpired={() => {
              setError("The reservation expired. Please select the seats again.");
              setHold(null); setPhase("SELECTING"); setSelected(new Set());
            }}
            onDone={(r) => { setResult(r); setPhase("DONE"); }}
          />
        )}
      </aside>

      {splitPrompt && (
        <SplitSofaDialog
          seatNumber={splitPrompt.seatNumber}
          partnerNumber={splitPrompt.partnerNumber}
          onCancel={() => setSplitPrompt(null)}
          onConfirm={confirmSplit}
        />
      )}
    </div>
  );
}

function SplitSofaDialog({ seatNumber, partnerNumber, onCancel, onConfirm }: {
  seatNumber: string; partnerNumber: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="split-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <h2 id="split-title" className="text-sm font-semibold text-ink-900">
          Split this double sofa?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {seatNumber} and {partnerNumber} are the two halves of one double sofa.
          Removing {seatNumber} sells {partnerNumber} on its own, so whoever books
          it will share the sofa with a stranger.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50">
            Keep both
          </button>
          <button type="button" onClick={onConfirm} autoFocus
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700">
            Sell {partnerNumber} alone
          </button>
        </div>
      </div>
    </div>
  );
}

function TripBar({ trip }: { trip: TripHeader }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      <div>
        <h1 className="text-sm font-semibold text-ink-900">
          {trip.origin} → {trip.destination}
          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
            {trip.direction === "ONWARD" ? "Onward" : "Return"}
          </span>
        </h1>
        <p className="mt-0.5 text-xs text-ink-500">
          {trip.busName} · {trip.registrationNo}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-ink-900">
          {formatTime(trip.departureAt)}
        </p>
        <p className="text-[11px] text-ink-500">{trip.serviceDate}</p>
      </div>
    </div>
  );
}

function SelectedList({ rows, fareOf, onRemove }: {
  rows: SeatStateRow[]; fareOf: (s: SeatStateRow) => number;
  onRemove?: (seatId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-xs text-ink-500">
      No seats selected yet. Click the map, or type the numbers above.
    </p>;
  }
  const total = rows.reduce((t, r) => t + fareOf(r), 0);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <span key={r.seatId}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">
            {r.seatNumber}
            {onRemove && (
              <button type="button" onClick={() => onRemove(r.seatId)}
                aria-label={`Remove seat ${r.seatNumber}`}
                className="rounded text-brand-500 hover:text-brand-800">
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      <p className="mt-2 flex justify-between text-xs">
        <span className="text-ink-500">{rows.length} seat{rows.length > 1 ? "s" : ""}</span>
        <span className="font-semibold tabular-nums text-ink-900">{formatINR(total)}</span>
      </p>
    </div>
  );
}

function BookingDone({ result, onNew }: {
  result: { bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number };
  onNew: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={36} />
      <h2 className="text-base font-semibold text-emerald-900">Booking confirmed</h2>
      <p className="mt-1 text-sm text-emerald-800">
        Seats {result.seatNumbers.join(", ")} · {formatINR(result.amountTotalPaise)}
      </p>
      <p className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-lg font-bold tracking-wider text-ink-900">
        {result.pnr}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Ticket size={15} /> Book another
        </button>
        <a href={`/tickets/${result.bookingId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          <Printer size={15} /> Print ticket
        </a>
        <a href="/holds"
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
          Reserved seats
        </a>
      </div>
    </div>
  );
}

/* ─────────────────── the customer + payment form ─────────────────── */

function ConfirmPanel({
  hold, rows, points, initialName, initialPhone,
  defaultFareFor, onRelease, onExtend, onExpired, onDone,
}: {
  hold: { holdId: string; expiresAt: string; serverNow: string };
  rows: SeatStateRow[];
  points: PointOption[];
  initialName: string;
  initialPhone: string;
  defaultFareFor: (s: SeatStateRow) => number;
  onRelease: () => void;
  onExtend: () => void;
  onExpired: () => void;
  onDone: (r: { bookingId: string; pnr: string; seatNumbers: string[]; amountTotalPaise: number }) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerName, setCustomerName] = useState(initialName);
  const [customerPhone, setCustomerPhone] = useState(initialPhone);
  const [paymentType, setPaymentType] = useState<"CASH" | "ONLINE" | "PENDING">("CASH");
  const [boardingPointId, setBoardingPointId] = useState("");
  const [boardingName, setBoardingName] = useState("");
  const [droppingPointId, setDroppingPointId] = useState("");
  const [droppingName, setDroppingName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** price per seat, pre-filled from the bus and editable here */
  const [fares, setFares] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.seatId, String(defaultFareFor(r) / 100)])));

  const pickups = points.filter((p) => p.kind === "BOARDING");
  const drops = points.filter((p) => p.kind === "DROPPING");
  const totalRupees = rows.reduce((t, r) => t + (Number(fares[r.seatId]) || 0), 0);

  function submit() {
    setError(null); setFieldErrors({});
    start(async () => {
      const res = await confirmBookingAction({
        holdId: hold.holdId,
        customerName, customerPhone,
        paymentType,
        amountPaid: paymentType === "PENDING" ? 0 : totalRupees,
        boardingPointId: boardingPointId || null,
        boardingName: boardingPointId ? "" : boardingName,
        droppingPointId: droppingPointId || null,
        droppingName: droppingPointId ? "" : droppingName,
        note,
        seats: rows.map((r) => ({
          seatId: r.seatId,
          fare: fares[r.seatId] || 0,
        })),
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not complete the booking.");
        setFieldErrors(res.fieldErrors ?? {});
        if (res.code === "HOLD_EXPIRED") onExpired();
        return;
      }
      onDone({
        bookingId: res.data.bookingId,
        pnr: res.data.pnr,
        seatNumbers: res.data.seatNumbers,
        amountTotalPaise: res.data.amountTotalPaise,
      });
    });
  }

  return (
    <section className="rounded-xl border border-brand-200 bg-[var(--surface)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Customer details</h2>
        <HoldTimer expiresAt={hold.expiresAt} serverNow={hold.serverNow}
          onExpire={onExpired} />
      </header>

      <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
          Reserved for you
        </p>
        <p className="mt-0.5 text-sm font-semibold text-brand-900">
          {rows.map((r) => r.seatNumber).join(", ")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <F label="Customer name" error={fieldErrors.customerName} required>
          <input value={customerName} autoFocus
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Full name" className={inp(!!fieldErrors.customerName)} />
        </F>
        <F label="Phone number" error={fieldErrors.customerPhone} required>
          <input value={customerPhone} inputMode="tel"
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="98765 43210" className={inp(!!fieldErrors.customerPhone)} />
        </F>

        <div className="grid grid-cols-2 gap-3">
          <F label="Pickup">
            {pickups.length > 0 ? (
              <select value={boardingPointId} className={cn(inp(false), "bg-white")}
                onChange={(e) => setBoardingPointId(e.target.value)}>
                <option value="">Type instead…</option>
                {pickups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input value={boardingName} onChange={(e) => setBoardingName(e.target.value)}
                placeholder="Pickup point" className={inp(false)} />
            )}
          </F>
          <F label="Destination">
            {drops.length > 0 ? (
              <select value={droppingPointId} className={cn(inp(false), "bg-white")}
                onChange={(e) => setDroppingPointId(e.target.value)}>
                <option value="">Type instead…</option>
                {drops.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input value={droppingName} onChange={(e) => setDroppingName(e.target.value)}
                placeholder="Drop point" className={inp(false)} />
            )}
          </F>
        </div>

        {pickups.length > 0 && !boardingPointId && (
          <input value={boardingName} onChange={(e) => setBoardingName(e.target.value)}
            placeholder="Pickup — type a one-off location" className={inp(false)} />
        )}
        {drops.length > 0 && !droppingPointId && (
          <input value={droppingName} onChange={(e) => setDroppingName(e.target.value)}
            placeholder="Destination — type a one-off location" className={inp(false)} />
        )}

        {/* price: defaults from the bus, editable per seat */}
        <fieldset className="rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-xs font-medium text-ink-700">Price</legend>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.seatId} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-700">
                  {r.seatNumber}
                </span>
                <span className="text-xs text-ink-400">₹</span>
                <input value={fares[r.seatId] ?? ""} inputMode="decimal"
                  onChange={(e) => setFares((f) => ({ ...f, [r.seatId]: e.target.value }))}
                  aria-label={`Price for seat ${r.seatNumber}`}
                  className="w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm tabular-nums outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
              </div>
            ))}
          </div>
          <p className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-sm">
            <span className="font-medium text-ink-700">Total</span>
            <span className="font-bold tabular-nums text-ink-900">
              {formatINR(Math.round(totalRupees * 100))}
            </span>
          </p>
        </fieldset>

        <F label="Payment">
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ["CASH", "Cash"],
              ["ONLINE", "Online"],
              ["PENDING", "Pay later"],
            ] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setPaymentType(v)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition",
                  paymentType === v
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-[var(--border)] text-ink-700 hover:bg-ink-50",
                )}>
                {label}
              </button>
            ))}
          </div>
          {paymentType === "PENDING" && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Nothing collected now. The booking is confirmed and shows as unpaid
              until someone records the payment.
            </p>
          )}
        </F>

        <F label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Optional" className={inp(false)} />
        </F>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button type="button" onClick={submit}
          disabled={pending || !customerName.trim() || !customerPhone.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />}
          Confirm booking
        </button>

        <button type="button" disabled={pending}
          onClick={() => start(async () => {
            await parkHoldAction(hold.holdId, customerName, customerPhone);
            router.push("/holds");
          })}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40">
          <PauseCircle size={15} /> Park it — confirm after payment
        </button>
        <p className="-mt-1 text-[11px] leading-relaxed text-ink-500">
          Keeps the seats reserved and takes you back to the queue. Find it again
          under Reserved seats.
        </p>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={onExtend} disabled={pending}
            className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900">
            <RefreshCw size={12} /> Add more time
          </button>
          <button type="button" onClick={onRelease} disabled={pending}
            className="text-red-600 hover:underline">
            Release seats
          </button>
        </div>
      </div>
    </section>
  );
}

function inp(hasError: boolean) {
  return cn("w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    hasError ? "border-red-400 bg-red-50"
      : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100");
}

function F({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
