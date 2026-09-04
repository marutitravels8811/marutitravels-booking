"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save, AlertTriangle, Info } from "lucide-react";
import { LayoutEditor } from "@/components/layout-editor/LayoutEditor";
import { generateStandardLayout, type DraftLayout } from "@/lib/seat-layout";
import { saveBusAction } from "./actions";
import { cn } from "@/lib/utils";

export interface BusFormInitial {
  id?: string;
  registrationNo: string;
  displayName: string;
  note: string;
  isActive: boolean;
  /** rupees, as shown in the form */
  fareSingleSofa: number;
  fareDoubleSofa: number;
  fareCabin: number;
  extraPersonSingle: number;
  extraPersonDouble: number;
  layout: DraftLayout;
  layoutInUse: boolean;
  layoutVersion?: number;
}

export function BusForm({ initial }: { initial?: BusFormInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [registrationNo, setRegistrationNo] = useState(initial?.registrationNo ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [fareSingleSofa, setFareSingleSofa] = useState(String(initial?.fareSingleSofa ?? ""));
  const [fareDoubleSofa, setFareDoubleSofa] = useState(String(initial?.fareDoubleSofa ?? ""));
  const [fareCabin, setFareCabin] = useState(String(initial?.fareCabin ?? ""));
  const [extraPersonSingle, setExtraPersonSingle] = useState(String(initial?.extraPersonSingle ?? 0));
  const [extraPersonDouble, setExtraPersonDouble] = useState(String(initial?.extraPersonDouble ?? 0));
  const [layout, setLayout] = useState<DraftLayout>(
    initial?.layout ?? generateStandardLayout(),
  );
  const [layoutValid, setLayoutValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await saveBusAction({
        id: initial?.id,
        registrationNo, displayName, note, isActive,
        fareSingleSofa: fareSingleSofa || 0,
        fareDoubleSofa: fareDoubleSofa || 0,
        fareCabin: fareCabin || 0,
        extraPersonSingle: extraPersonSingle || 0,
        extraPersonDouble: extraPersonDouble || 0,
        layout: { ...layout, name: layout.name || `${displayName} layout` },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save");
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      router.push("/masters/buses");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-800">Bus details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration number" error={fieldErrors.registrationNo}>
            <input value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
              placeholder="GJ 03 AB 1234"
              className={inputCls(!!fieldErrors.registrationNo)} />
          </Field>
          <Field label="Display name" error={fieldErrors.displayName}>
            <input value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Volvo Sleeper 1"
              className={inputCls(!!fieldErrors.displayName)} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — anything the counter should know"
              className={inputCls(false)} />
          </Field>
        </div>
        <fieldset className="mt-5 rounded-lg border border-[var(--border)] p-4">
          <legend className="px-1 text-xs font-medium text-ink-700">
            Default fares
          </legend>
          <p className="mb-3 text-xs text-ink-500">
            These pre-fill the price when booking this bus. The agent can still
            change the amount on any individual ticket.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Single sofa (₹)" error={fieldErrors.fareSingleSofa}>
              <input value={fareSingleSofa} inputMode="decimal"
                onChange={(e) => setFareSingleSofa(e.target.value)}
                placeholder="900" className={inputCls(!!fieldErrors.fareSingleSofa)} />
            </Field>
            <Field label="Double sofa, per berth (₹)" error={fieldErrors.fareDoubleSofa}>
              <input value={fareDoubleSofa} inputMode="decimal"
                onChange={(e) => setFareDoubleSofa(e.target.value)}
                placeholder="800" className={inputCls(!!fieldErrors.fareDoubleSofa)} />
            </Field>
            <Field label="Cabin seat (₹)" error={fieldErrors.fareCabin}>
              <input value={fareCabin} inputMode="decimal"
                onChange={(e) => setFareCabin(e.target.value)}
                placeholder="1200" className={inputCls(!!fieldErrors.fareCabin)} />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Extra person — single sofa (₹)" error={fieldErrors.extraPersonSingle}>
              <input value={extraPersonSingle} inputMode="decimal"
                onChange={(e) => setExtraPersonSingle(e.target.value)}
                placeholder="0" className={inputCls(!!fieldErrors.extraPersonSingle)} />
            </Field>
            <Field label="Extra person — double sofa (₹)" error={fieldErrors.extraPersonDouble}>
              <input value={extraPersonDouble} inputMode="decimal"
                onChange={(e) => setExtraPersonDouble(e.target.value)}
                placeholder="0" className={inputCls(!!fieldErrors.extraPersonDouble)} />
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            Agents can add one extra person to a single or double sofa during booking.
          </p>
        </fieldset>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
          Active — available for scheduling
        </label>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Seat layout</h2>
          {initial?.layoutVersion && (
            <span className="text-xs text-ink-500">version {initial.layoutVersion}</span>
          )}
        </div>

        {initial?.layoutInUse && (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Trips already use this layout, so it is locked. Saving your changes
              creates a <strong>new version</strong>; existing trips and printed
              tickets keep the seat numbers they were sold with.
            </span>
          </p>
        )}

        <LayoutEditor
          initial={layout}
          onChange={(l, valid) => { setLayout(l); setLayoutValid(valid); }}
        />
      </section>

      {error && (
        <p role="alert"
          className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <button type="button" onClick={submit}
          disabled={pending || !layoutValid || !registrationNo || !displayName}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {initial?.id ? "Save changes" : "Create bus"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="text-sm text-ink-600 hover:text-ink-900">
          Cancel
        </button>
        {!layoutValid && (
          <span className="text-xs text-amber-700">
            Fix the layout problems before saving.
          </span>
        )}
      </div>
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    hasError
      ? "border-red-400 bg-red-50"
      : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
  );
}

function Field({ label, error, children, className }: {
  label: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
