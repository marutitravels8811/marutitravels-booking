"use client";

import { useState, useTransition } from "react";
import { saveOfficeSettingsAction } from "./actions";

type Settings = {
  address: string;
  phone: string;
  altAddress: string;
  altPhone: string;
};

export function OfficeSettingsPanel({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof Settings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveOfficeSettingsAction(settings);
      if (!result.ok) setError(result.error ?? "Could not save office details.");
      else setMessage("Office details saved. New tickets will use these values.");
    });
  }

  const field = "mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
  return (
    <section className="max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-xs leading-5 text-ink-500">
        Environment variables are no longer used for these four ticket fields.
        Leave a field blank if that office does not have a second contact detail.
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <fieldset className="rounded-lg border border-[var(--border)] p-4">
          <legend className="px-1 text-sm font-semibold text-ink-800">Office 1</legend>
          <label className="mt-2 block text-sm font-medium text-ink-700">
            Address
            <textarea value={settings.address} onChange={(e) => update("address", e.target.value)}
              rows={4} className={field} />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-700">
            Phone numbers
            <textarea value={settings.phone} onChange={(e) => update("phone", e.target.value)}
              rows={3} placeholder="One number per line" className={field} />
          </label>
        </fieldset>
        <fieldset className="rounded-lg border border-[var(--border)] p-4">
          <legend className="px-1 text-sm font-semibold text-ink-800">Office 2</legend>
          <label className="mt-2 block text-sm font-medium text-ink-700">
            Address
            <textarea value={settings.altAddress} onChange={(e) => update("altAddress", e.target.value)}
              rows={4} className={field} />
          </label>
          <label className="mt-3 block text-sm font-medium text-ink-700">
            Phone numbers
            <textarea value={settings.altPhone} onChange={(e) => update("altPhone", e.target.value)}
              rows={3} placeholder="One number per line" className={field} />
          </label>
        </fieldset>
      </div>
      <button type="button" onClick={save} disabled={pending}
        className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Save office details"}
      </button>
      {(message || error) && (
        <p className={`mt-3 rounded-lg p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  );
}
