"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save, Plus, Trash2, AlertTriangle, MapPin } from "lucide-react";
import { saveRouteAction } from "./actions";
import { cn } from "@/lib/utils";

export interface PointDraft {
  id?: string;
  key: string;
  name: string;
  address: string;
  kind: "BOARDING" | "DROPPING";
  sequence: number;
  offsetMinutes: number;
}

export interface RouteFormInitial {
  id?: string;
  code: string;
  origin: string;
  destination: string;
  distanceKm: string;
  defaultDurationMin: string;
  isActive: boolean;
  points: PointDraft[];
}

let k = 0;
const newKey = () => `p_${++k}_${Math.random().toString(36).slice(2, 7)}`;

export function RouteForm({ initial }: { initial?: RouteFormInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(initial?.code ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [distanceKm, setDistanceKm] = useState(initial?.distanceKm ?? "");
  const [duration, setDuration] = useState(initial?.defaultDurationMin ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [points, setPoints] = useState<PointDraft[]>(initial?.points ?? []);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const addPoint = (kind: "BOARDING" | "DROPPING") =>
    setPoints((ps) => [...ps, {
      key: newKey(), name: "", address: "", kind,
      sequence: ps.filter((p) => p.kind === kind).length,
      offsetMinutes: 0,
    }]);

  const patch = (key: string, p: Partial<PointDraft>) =>
    setPoints((ps) => ps.map((x) => (x.key === key ? { ...x, ...p } : x)));

  function submit() {
    setError(null); setFieldErrors({});
    startTransition(async () => {
      const res = await saveRouteAction({
        id: initial?.id, code, origin, destination,
        distanceKm: distanceKm ? Number(distanceKm) : null,
        defaultDurationMin: duration ? Number(duration) : null,
        isActive,
        points: points
          .filter((p) => p.name.trim())
          .map((p) => ({
            id: p.id, name: p.name, address: p.address,
            kind: p.kind, sequence: p.sequence,
            offsetMinutes: Number(p.offsetMinutes) || 0,
          })),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save");
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      router.push("/masters/routes");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-800">Route</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" error={fieldErrors.code}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RJT-BOM" className={inputCls(!!fieldErrors.code)} />
          </Field>
          <Field label="From" error={fieldErrors.origin}>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)}
              placeholder="Rajkot" className={inputCls(!!fieldErrors.origin)} />
          </Field>
          <Field label="To" error={fieldErrors.destination}>
            <input value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="Mumbai" className={inputCls(!!fieldErrors.destination)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Distance (km)">
              <input value={distanceKm} inputMode="numeric"
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="640" className={inputCls(false)} />
            </Field>
            <Field label="Duration (min)">
              <input value={duration} inputMode="numeric"
                onChange={(e) => setDuration(e.target.value)}
                placeholder="660" className={inputCls(false)} />
            </Field>
          </div>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
          Active
        </label>
      </section>

      {(["BOARDING", "DROPPING"] as const).map((kind) => {
        const list = points.filter((p) => p.kind === kind);
        return (
          <section key={kind}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <MapPin size={15} className="text-ink-400" />
                {kind === "BOARDING" ? "Pickup points" : "Drop points"}
              </h2>
              <button type="button" onClick={() => addPoint(kind)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                <Plus size={13} /> Add
              </button>
            </div>

            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-5 text-center text-xs text-ink-500">
                No {kind === "BOARDING" ? "pickup" : "drop"} points yet. Agents can
                still type one directly on a booking.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {list.map((p) => (
                  <div key={p.key}
                    className="grid items-end gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                    <Field label="Name">
                      <input value={p.name} onChange={(e) => patch(p.key, { name: e.target.value })}
                        placeholder="Bus stand" className={inputCls(false)} />
                    </Field>
                    <Field label="Address">
                      <input value={p.address} onChange={(e) => patch(p.key, { address: e.target.value })}
                        placeholder="Optional landmark" className={inputCls(false)} />
                    </Field>
                    <Field label="± min">
                      <input value={p.offsetMinutes} inputMode="numeric"
                        onChange={(e) => patch(p.key, { offsetMinutes: Number(e.target.value) || 0 })}
                        className={cn(inputCls(false), "w-20")} />
                    </Field>
                    <button type="button"
                      onClick={() => setPoints((ps) => ps.filter((x) => x.key !== p.key))}
                      aria-label={`Remove ${p.name || "point"}`}
                      className="mb-0.5 rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit}
          disabled={pending || !code || !origin || !destination}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {initial?.id ? "Save changes" : "Create route"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="text-sm text-ink-600 hover:text-ink-900">Cancel</button>
      </div>
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn("w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    hasError ? "border-red-400 bg-red-50"
      : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100");
}

function Field({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
