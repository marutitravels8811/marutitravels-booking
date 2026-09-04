"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm({ forced, agentName }: {
  forced: boolean; agentName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;

  function submit() {
    setError(null); setFieldErrors({});
    start(async () => {
      const res = await changePasswordAction(current, next, confirm);
      if (!res.ok) {
        setError(res.error ?? "Could not change your password.");
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setDone(true);
      router.replace("/trips");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-md">
      {forced && (
        <Alert kind="warning" className="mb-4" title="Choose your own password">
          {agentName}, you are signed in with a temporary password issued by a
          colleague. Set your own before carrying on — nothing else is available
          until you do.
        </Alert>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <KeyRound size={20} />
        </span>
        <h1 className="text-base font-semibold text-ink-900">Change your password</h1>
        <p className="mb-5 mt-1 text-sm text-ink-500">
          At least 8 characters. Nobody else can see it, including the office.
        </p>

        <Field label="Current password" error={fieldErrors.currentPassword}>
          <input type="password" value={current} autoFocus
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
            className={inp(!!fieldErrors.currentPassword)} />
        </Field>

        <Field label="New password" error={fieldErrors.newPassword}
          hint={tooShort ? "At least 8 characters" : undefined}>
          <input type="password" value={next} autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
            className={inp(!!fieldErrors.newPassword || tooShort)} />
        </Field>

        <Field label="Repeat the new password" error={fieldErrors.confirm}>
          <input type="password" value={confirm} autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            onChange={(e) => setConfirm(e.target.value)}
            className={inp(!!fieldErrors.confirm)} />
        </Field>

        {error && <Alert className="mb-4">{error}</Alert>}
        {done && <Alert kind="success" className="mb-4">Password changed.</Alert>}

        <button type="button" onClick={submit}
          disabled={pending || !current || next.length < 8 || !confirm}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40">
          {pending && <Loader2 size={15} className="animate-spin" />}
          Change password
        </button>
      </div>
    </div>
  );
}

function inp(bad: boolean) {
  return cn("w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
    bad ? "border-red-400 bg-red-50"
        : "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-100");
}

function Field({ label, error, hint, children }: {
  label: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
      {(error || hint) && (
        <p className={cn("mt-1 text-[11px]", error ? "text-red-600" : "text-amber-700")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
