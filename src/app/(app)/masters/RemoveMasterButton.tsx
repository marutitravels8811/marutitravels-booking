"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export function RemoveMasterButton({
  label,   id, futureTripCount, onRemove,
}: {
  label: string;
  id: string;
  futureTripCount: number;
  onRemove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function remove() {
    setError(null);
    setOpen(true);
  }

  function confirmRemove() {
    setOpen(false);
    startTransition(async () => {
      const result = await onRemove(id);
      if (!result.ok) {
        setError(result.error ?? `Could not remove ${label}.`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={remove} disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        Remove
      </button>
    {open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-[var(--surface)] p-5 shadow-xl">
          <h2 className="text-base font-semibold text-ink-900">Remove {label}?</h2>
          <p className="mt-2 text-sm text-ink-600">
            This will hide the {label} and prevent new bookings.
            {futureTripCount > 0
              ? ` ${futureTripCount} future scheduled trip${futureTripCount === 1 ? "" : "s"} will also be cancelled.`
              : " There are no future scheduled trips to cancel."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-700">Keep</button>
            <button type="button" onClick={confirmRemove} disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              {pending ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    )}
    {error && <span className="block max-w-48 text-right text-[11px] text-red-600">{error}</span>}
    </>
  );
}
