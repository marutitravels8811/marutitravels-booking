"use client";

import { useState, useTransition } from "react";
import {
  deleteRetentionDataAction, getRetentionPreviewAction, saveRetentionSettingsAction,
} from "./actions";

type Selection = {
  bookings: boolean;
  expiredHolds: boolean;
  completedTrips: boolean;
  idempotencyKeys: boolean;
};
type Settings = Selection & {
  enabled: boolean;
  retentionDays: number;
  frequency: "DAILY" | "WEEKLY";
  lastRunAt: Date | null;
};
type Preview = {
  cutoff: Date;
  bookings: number;
  payments: number;
  expiredHolds: number;
  completedTrips: number;
  idempotencyKeys: number;
};

const CATEGORY_INFO: Array<{ key: keyof Selection; title: string; description: string }> = [
  {
    key: "bookings",
    title: "Old booking history",
    description: "Deletes eligible completed, cancelled, and no-show bookings before the cutoff, including their seat rows and payment records. Future and active bookings are never eligible.",
  },
  {
    key: "expiredHolds",
    title: "Expired reservations",
    description: "Deletes released, expired, and consumed seat-hold records before the cutoff. Active reservations are protected.",
  },
  {
    key: "completedTrips",
    title: "Empty completed trips",
    description: "Deletes cancelled or completed trips before the cutoff only when they have no bookings and no active reservations. Buses, routes, and schedules remain.",
  },
  {
    key: "idempotencyKeys",
    title: "Old request keys",
    description: "Deletes old booking request-protection keys. This does not remove bookings or payments.",
  },
];

function formatDate(value: Date | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function DataRetentionPanel({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [manualDays, setManualDays] = useState(String(initialSettings.retentionDays));
  const [manualSelection, setManualSelection] = useState<Selection>({
    bookings: true, expiredHolds: true, completedTrips: false, idempotencyKeys: true,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateSelection(key: keyof Selection, value: boolean) {
    setManualSelection((current) => ({ ...current, [key]: value }));
  }

  function loadPreview() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await getRetentionPreviewAction({ days: Number(manualDays), selection: manualSelection });
      if (!result.ok) {
        setError(result.error ?? "Could not preview cleanup.");
      } else if (result.preview) {
        setPreview(result.preview);
      }
    });
  }

  function deleteData() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await deleteRetentionDataAction({
        days: Number(manualDays), selection: manualSelection, confirmation,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not delete data.");
      } else {
        setMessage("Selected historical data was permanently removed.");
        setPreview(null);
        setConfirmation("");
      }
    });
  }

  function saveSettings() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveRetentionSettingsAction({
        enabled: settings.enabled,
        retentionDays: settings.retentionDays,
        frequency: settings.frequency,
        selection: {
          bookings: settings.bookings,
          expiredHolds: settings.expiredHolds,
          completedTrips: settings.completedTrips,
          idempotencyKeys: settings.idempotencyKeys,
        },
      });
      if (!result.ok) setError(result.error ?? "Could not save automatic cleanup settings.");
      else setMessage("Automatic cleanup settings saved.");
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold text-ink-900">Manual cleanup</h2>
        <p className="mt-1 text-xs text-ink-500">Preview the affected records before permanently deleting them.</p>
        <label className="mt-4 block text-sm font-medium text-ink-700">
          Remove records older than
          <span className="mt-1 flex items-center gap-2">
            <input type="number" min={1} max={3650} value={manualDays}
              onChange={(e) => setManualDays(e.target.value)}
              className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
            <span className="text-xs font-normal text-ink-500">days</span>
          </span>
        </label>
        <div className="mt-4 space-y-3">
          {CATEGORY_INFO.map((item) => (
            <label key={item.key} className="block rounded-lg border border-[var(--border)] p-3">
              <span className="flex items-start gap-2">
                <input type="checkbox" checked={manualSelection[item.key]}
                  onChange={(e) => updateSelection(item.key, e.target.checked)}
                  className="mt-1" />
                <span>
                  <span className="block text-sm font-medium text-ink-800">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-500">{item.description}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
        <button type="button" onClick={loadPreview} disabled={pending}
          className="mt-4 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50">
          {pending ? "Checking…" : "Preview affected data"}
        </button>
        {preview && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Cutoff: {formatDate(preview.cutoff)}</p>
            <p className="mt-1 text-xs">
              {preview.bookings} bookings, {preview.payments} payments, {preview.expiredHolds} holds,{" "}
              {preview.completedTrips} trips, and {preview.idempotencyKeys} request keys will be deleted.
            </p>
            <label className="mt-3 block text-xs font-semibold">
              Type DELETE to confirm permanent removal
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                className="mt-1 block w-full rounded border border-amber-300 px-2 py-1.5 font-normal" />
            </label>
            <button type="button" onClick={deleteData} disabled={pending || confirmation !== "DELETE"}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Permanently delete selected data
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold text-ink-900">Automatic cleanup</h2>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          Disabled until an agent enables it. The daily cron checks these settings and runs only when the selected cadence is due.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-800">
          <input type="checkbox" checked={settings.enabled}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} />
          Enable automatic cleanup
        </label>
        <label className="mt-4 block text-sm font-medium text-ink-700">
          Retain data for
          <span className="mt-1 flex items-center gap-2">
            <input type="number" min={1} max={3650} value={settings.retentionDays}
              onChange={(e) => setSettings((s) => ({ ...s, retentionDays: Number(e.target.value) }))}
              className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
            <span className="text-xs font-normal text-ink-500">days</span>
          </span>
        </label>
        <label className="mt-4 block text-sm font-medium text-ink-700">
          Run cleanup
          <select value={settings.frequency}
            onChange={(e) => setSettings((s) => ({ ...s, frequency: e.target.value as "DAILY" | "WEEKLY" }))}
            className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            <option value="DAILY">Every 24 hours</option>
            <option value="WEEKLY">Every 7 days</option>
          </select>
        </label>
        <div className="mt-4 space-y-2">
          {CATEGORY_INFO.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={settings[item.key]}
                onChange={(e) => setSettings((s) => ({ ...s, [item.key]: e.target.checked }))} />
              {item.title}
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-500">Last automatic run: {formatDate(settings.lastRunAt)}</p>
        <button type="button" onClick={saveSettings} disabled={pending}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save automatic cleanup"}
        </button>
      </section>
      {(message || error) && (
        <p className={`lg:col-span-2 rounded-lg p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error ?? message}
        </p>
      )}
    </div>
  );
}
