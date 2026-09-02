"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, Wand2, X } from "lucide-react";
import { createAdHocTripAction, generateTripsAction } from "./actions";
import { cn } from "@/lib/utils";

interface Option { id: string; label: string }

export function TripTools({ routes, buses, date }: {
  routes: Option[]; buses: Option[]; date: string;
}) {
  const [open, setOpen] = useState<"adhoc" | "generate" | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setOpen("generate")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
        <Wand2 size={15} /> Generate from schedule
      </button>
      <button type="button" onClick={() => setOpen("adhoc")}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        <CalendarPlus size={15} /> Add extra bus
      </button>

      {open === "adhoc" && (
        <AdHocDialog routes={routes} buses={buses} date={date}
          onClose={() => setOpen(null)} />
      )}
      {open === "generate" && (
        <GenerateDialog date={date} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function Dialog({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/30 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AdHocDialog({ routes, buses, date, onClose }: {
  routes: Option[]; buses: Option[]; date: string; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [busId, setBusId] = useState(buses[0]?.id ?? "");
  const [direction, setDirection] = useState<"ONWARD" | "RETURN">("ONWARD");
  const [serviceDate, setServiceDate] = useState(date);
  const [departureTime, setDepartureTime] = useState("21:00");
  const [arrivalTime, setArrivalTime] = useState("07:00");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await createAdHocTripAction({
        routeId, busId, direction, serviceDate, departureTime, arrivalTime,
      });
      if (!res.ok) { setError(res.error ?? "Could not create the trip"); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Add an extra bus"
      subtitle="For a day that needs a second or third departure."
      onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Sel label="Route" value={routeId} onChange={setRouteId} options={routes} />
        <Sel label="Bus" value={busId} onChange={setBusId} options={buses} />
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Direction" value={direction}
            onChange={(v) => setDirection(v as "ONWARD" | "RETURN")}
            options={[{ id: "ONWARD", label: "Onward" }, { id: "RETURN", label: "Return" }]} />
          <Inp label="Date" type="date" value={serviceDate} onChange={setServiceDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Departure" type="time" value={departureTime} onChange={setDepartureTime} />
          <Inp label="Arrival" type="time" value={arrivalTime} onChange={setArrivalTime} />
        </div>
        <p className="text-[11px] text-ink-500">
          An arrival earlier than the departure is treated as the next morning.
        </p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <button type="button" onClick={submit} disabled={pending || !routeId || !busId}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />} Create trip
        </button>
      </div>
    </Dialog>
  );
}

function GenerateDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fromDate, setFromDate] = useState(date);
  const [toDate, setToDate] = useState(() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  function submit() {
    setError(null); setResult(null);
    start(async () => {
      const res = await generateTripsAction({ fromDate, toDate });
      if (!res.ok) { setError(res.error ?? "Could not generate"); return; }
      setResult(res.data!);
      router.refresh();
    });
  }

  return (
    <Dialog title="Generate trips"
      subtitle="Creates the daily trips from your saved schedules. Safe to re-run — existing trips are skipped."
      onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Inp label="From" type="date" value={fromDate} onChange={setFromDate} />
          <Inp label="To" type="date" value={toDate} onChange={setToDate} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {result && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <p><strong>{result.created}</strong> created, <strong>{result.skipped}</strong> already existed.</p>
            {result.errors.length > 0 && (
              <ul className="mt-1 text-red-700">
                {result.errors.slice(0, 4).map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            )}
          </div>
        )}
        <button type="button" onClick={submit} disabled={pending}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />} Generate
        </button>
        <a href="/masters/schedules"
          className="text-center text-xs text-brand-600 hover:underline">
          Manage schedules
        </a>
      </div>
    </Dialog>
  );
}

const field = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "bg-white")}>
        {options.length === 0 && <option value="">None available</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Inp({ label, type, value, onChange }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </div>
  );
}
