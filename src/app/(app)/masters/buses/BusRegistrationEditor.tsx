"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateBusRegistrationAction } from "./actions";

export function BusRegistrationEditor({
  busId, initialValue,
}: { busId: string; initialValue: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBusRegistrationAction(busId, value);
      if (!result.ok) {
        setError(result.error ?? "Could not update registration number.");
        return;
      }
      const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
      setValue(normalized);
      setSavedValue(normalized);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div>
        <span className="block text-ink-400">Registration</span>
        <span className="font-mono font-medium text-ink-700">{value}</span>
        <button type="button" onClick={() => setEditing(true)}
          className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline">
          <Pencil size={11} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="col-span-2">
      <span className="block text-ink-400">Registration</span>
      <div className="mt-1 flex items-center gap-1.5">
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
          disabled={pending} className="min-w-0 flex-1 rounded-md border border-brand-400 px-2 py-1 font-mono text-xs uppercase outline-none focus:ring-2 focus:ring-brand-100" />
        <button type="button" onClick={save} disabled={pending}
          className="rounded-md bg-emerald-600 p-1.5 text-white disabled:opacity-50" aria-label="Save registration">
          <Check size={14} />
        </button>
        <button type="button" onClick={() => { setValue(savedValue); setError(null); setEditing(false); }}
          disabled={pending} className="rounded-md border border-[var(--border)] p-1.5 text-ink-600 disabled:opacity-50" aria-label="Cancel edit">
          <X size={14} />
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
