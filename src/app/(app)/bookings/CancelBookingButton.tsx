"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { cancelBookingAction } from "./actions";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!window.confirm("Cancel this booking and release its seats?")) return;
    const reason = window.prompt("Why is this booking being cancelled?");
    if (!reason?.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAction({ bookingId, reason: reason.trim() });
      if (!result.ok) {
        setError(result.error ?? "The booking could not be cancelled.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={cancel} disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
        Cancel
      </button>
      {error && <span role="alert" className="max-w-48 text-right text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
