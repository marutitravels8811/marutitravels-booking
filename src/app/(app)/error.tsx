"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Whatever escaped a page ends here. The message is never shown: it can carry
 * SQL, ids, or a customer's phone number. The digest is, so a report can be
 * matched to the server log.
 */
export default function ErrorBoundary({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[page]", error); }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangle size={22} />
        </span>
        <h1 className="text-base font-semibold text-ink-900">
          Something went wrong on this page
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Nothing you were doing has been saved. Try again — if it keeps
          happening, note the code below and tell the office.
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-600">
            {error.digest}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <RotateCw size={15} /> Try again
          </button>
          <a href="/dashboard"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
