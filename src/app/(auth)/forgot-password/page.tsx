"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bus, CheckCircle2, Loader2 } from "lucide-react";
import { forgotPasswordAction, type ForgotState } from "../login/actions";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(
    forgotPasswordAction, {},
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Bus size={22} />
          </span>
          <h1 className="text-lg font-semibold text-ink-900">Forgotten password</h1>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          {state.done ? (
            <>
              <p className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>Request sent to the office.</span>
              </p>
              <p className="text-sm leading-relaxed text-ink-600">
                Ask any colleague who is signed in to open{" "}
                <strong className="font-medium text-ink-800">Agents</strong> and
                approve it. They will read you a temporary password, and you will
                be asked to choose a new one straight after signing in.
              </p>
              <p className="mt-3 text-xs text-ink-500">
                The request stays open for one hour.
              </p>
              <Link href="/login"
                className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Back to sign in
              </Link>
            </>
          ) : (
            <form action={action}>
              <p className="mb-4 text-sm leading-relaxed text-ink-600">
                This raises a request that any signed-in colleague can approve
                from the Agents screen. There is no email involved — they will
                read you a temporary password.
              </p>

              <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-700">
                Your email
              </label>
              <input id="email" name="email" type="email" required autoFocus
                autoComplete="username"
                className="mb-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />

              {state.error && <Alert className="mb-4">{state.error}</Alert>}

              <button type="submit" disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">
                {pending && <Loader2 size={15} className="animate-spin" />}
                Request a reset
              </button>

              <Link href="/login"
                className="mt-4 block text-center text-xs text-ink-500 hover:text-ink-800">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
