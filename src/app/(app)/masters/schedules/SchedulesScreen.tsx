"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Info, Loader2, Plus, Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";
import { saveScheduleAction, setScheduleActiveAction, scheduleImpactAction } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ScheduleView {
  id: string;
  routeId: string; routeCode: string; origin: string; destination: string;
  busId: string; busName: string; registrationNo: string;
  direction: "ONWARD" | "RETURN";
  departureTime: string; arrivalTime: string;
  daysOfWeek: number[];
  validFrom: string; validTo: string | null;
  isActive: boolean;
  tripsGenerated: number;
  lastGeneratedDate: string | null;
}
export interface Option { id: string; label: string }

export function SchedulesScreen({
  schedules, routes, buses, today,
}: {
  schedules: ScheduleView[]; routes: Option[]; buses: Option[]; today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<ScheduleView | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleActive(s: ScheduleView) {
    setError(null); setNotice(null);
    start(async () => {
      if (s.isActive) {
        const impact = await scheduleImpactAction(s.id);
        const t = impact.data;
        if (t && t.total > 0) {
          const msg = t.withBookings > 0
            ? `Turning this off stops new trips being generated. ${t.total} future trip(s) already exist, ${t.withBookings} with bookings — those keep running. Cancel them from the Trips screen if the service is really stopping.`
            : `Turning this off stops new trips being generated. ${t.total} future trip(s) already exist and will still run.`;
          setNotice(msg);
        }
      }
      const res = await setScheduleActiveAction(s.id, !s.isActive);
      if (!res.ok) { setError(res.error ?? "Could not change that."); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="info">{notice}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          A schedule is the standing pattern — which bus leaves when, on which
          days. Trips for each date are generated from these.
        </p>
        <button type="button"
          onClick={() => { setAdding(true); setEditing(null); }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus size={15} /> Add schedule
        </button>
      </div>

      {(adding || editing) && (
        <ScheduleForm
          schedule={editing} routes={routes} buses={buses} today={today}
          pending={pending}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSave={(values) => start(async () => {
            setError(null); setNotice(null);
            const res = await saveScheduleAction(values);
            if (!res.ok) { setError(res.error ?? "Could not save the schedule."); return; }
            setAdding(false); setEditing(null);
            setNotice("Saved. Run “Generate from schedule” on the Trips screen to create the trips.");
            router.refresh();
          })} />
      )}

      {schedules.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <CalendarClock className="mx-auto mb-3 text-ink-300" size={28} />
          <p className="mb-1 text-sm font-medium text-ink-700">No schedules yet</p>
          <p className="mb-4 text-xs text-ink-500">
            Add the daily pattern your buses run, then generate trips from it.
          </p>
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> Add schedule
          </button>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {schedules.map((s) => (
            <article key={s.id}
              className={cn("rounded-xl border bg-[var(--surface)] p-4",
                s.isActive ? "border-[var(--border)]" : "border-[var(--border)] bg-ink-50/60")}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink-900">
                    {s.origin} → {s.destination}
                    <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">
                      {s.direction === "ONWARD" ? "Onward" : "Return"}
                    </span>
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {s.busName} · {s.registrationNo}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-ink-900">
                    {s.departureTime}
                  </p>
                  <p className="text-[11px] text-ink-500">arr {s.arrivalTime}</p>
                </div>
              </div>

              <div className="mb-2 flex flex-wrap gap-1">
                {DAYS.map((d, i) => (
                  <span key={d}
                    className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                      s.daysOfWeek.includes(i)
                        ? "bg-brand-100 text-brand-800"
                        : "bg-ink-100 text-ink-400")}>
                    {d}
                  </span>
                ))}
              </div>

              <p className="mb-2 text-[11px] text-ink-500">
                From {s.validFrom}{s.validTo ? ` to ${s.validTo}` : " · no end date"}
                {" · "}
                {s.tripsGenerated > 0
                  ? <>{s.tripsGenerated} trips generated{s.lastGeneratedDate && `, up to ${s.lastGeneratedDate}`}</>
                  : "no trips generated yet"}
              </p>

              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-2 text-xs">
                <span className={s.isActive
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"
                  : "rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-500"}>
                  {s.isActive ? "Active" : "Paused"}
                </span>
                <button type="button" disabled={pending}
                  onClick={() => { setEditing(s); setAdding(false); }}
                  className="font-medium text-brand-600 hover:underline disabled:opacity-40">
                  Edit
                </button>
                <button type="button" disabled={pending}
                  onClick={() => toggleActive(s)}
                  className={cn("ml-auto font-medium hover:underline disabled:opacity-40",
                    s.isActive ? "text-amber-700" : "text-emerald-700")}>
                  {s.isActive ? "Pause" : "Resume"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleForm({
  schedule, routes, buses, today, pending, onSave, onCancel,
}: {
  schedule: ScheduleView | null;
  routes: Option[]; buses: Option[]; today: string; pending: boolean;
  onSave: (v: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [routeId, setRouteId] = useState(schedule?.routeId ?? routes[0]?.id ?? "");
  const [busId, setBusId] = useState(schedule?.busId ?? buses[0]?.id ?? "");
  const [direction, setDirection] = useState<"ONWARD" | "RETURN">(schedule?.direction ?? "ONWARD");
  const [departureTime, setDepartureTime] = useState(schedule?.departureTime ?? "21:00");
  const [arrivalTime, setArrivalTime] = useState(schedule?.arrivalTime ?? "07:00");
  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [validFrom, setValidFrom] = useState(schedule?.validFrom ?? today);
  const [validTo, setValidTo] = useState(schedule?.validTo ?? "");
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true);

  const toggleDay = (i: number) =>
    setDays((d) => d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort());

  const overnight = arrivalTime <= departureTime;

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-900">
        {schedule ? "Edit schedule" : "Add a schedule"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <L label="Route">
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={field}>
            {routes.length === 0 && <option value="">Add a route first</option>}
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </L>
        <L label="Bus">
          <select value={busId} onChange={(e) => setBusId(e.target.value)} className={field}>
            {buses.length === 0 && <option value="">Add a bus first</option>}
            {buses.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </L>
        <L label="Direction">
          <select value={direction} className={field}
            onChange={(e) => setDirection(e.target.value as "ONWARD" | "RETURN")}>
            <option value="ONWARD">Onward</option>
            <option value="RETURN">Return</option>
          </select>
        </L>
        <L label="Departure">
          <input type="time" value={departureTime} className={field}
            onChange={(e) => setDepartureTime(e.target.value)} />
        </L>
        <L label="Arrival" hint={overnight ? "Next morning" : undefined}>
          <input type="time" value={arrivalTime} className={field}
            onChange={(e) => setArrivalTime(e.target.value)} />
        </L>
        <L label="Runs from">
          <input type="date" value={validFrom} className={field}
            onChange={(e) => setValidFrom(e.target.value)} />
        </L>
        <L label="Until" hint="Leave empty to run indefinitely">
          <input type="date" value={validTo} className={field}
            onChange={(e) => setValidTo(e.target.value)} />
        </L>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-ink-700">Days it runs</p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(i)}
              aria-pressed={days.includes(i)}
              className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                days.includes(i)
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-[var(--border)] bg-white text-ink-600 hover:bg-ink-50")}>
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
            className="ml-1 text-xs text-brand-600 hover:underline">Every day</button>
          <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}
            className="text-xs text-brand-600 hover:underline">Weekdays</button>
        </div>
        {days.length === 0 && (
          <p className="mt-1 text-[11px] text-red-600">Pick at least one day.</p>
        )}
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
        Active — include when generating trips
      </label>

      {schedule && schedule.tripsGenerated > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            {schedule.tripsGenerated} trips were already generated from this
            schedule. Editing changes what gets generated <strong>from now on</strong> —
            trips that already exist keep their current times, because tickets
            may have been printed against them. Change or cancel those from the
            Trips screen.
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !routeId || !busId || days.length === 0}
          onClick={() => onSave({
            id: schedule?.id, routeId, busId, direction,
            departureTime, arrivalTime, daysOfWeek: days,
            validFrom, validTo: validTo || null, isActive,
          })}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {schedule ? "Save changes" : "Create schedule"}
        </button>
        <button type="button" onClick={onCancel}
          className="text-sm text-ink-600 hover:text-ink-900">Cancel</button>
      </div>
    </section>
  );
}

const field = "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function L({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
