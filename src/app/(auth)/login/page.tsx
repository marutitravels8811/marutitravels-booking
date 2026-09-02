"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bus, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Alert } from "@/components/ui/Alert";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction, {},
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Bus size={22} />
          </span>
          <h1 className="text-lg font-semibold text-ink-900">Counter sign in</h1>
          <p className="text-xs text-ink-500">Booking desk · staff only</p>
        </div>

        <form action={action}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-700">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="username"
            autoFocus
            className="mb-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />

          <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-700">
            Password
          </label>
          <input id="password" name="password" type="password" required
            autoComplete="current-password"
            className="mb-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />

          {state.error && <Alert className="mb-4">{state.error}</Alert>}

          <button type="submit" disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">
            {pending && <Loader2 size={15} className="animate-spin" />}
            Sign in
          </button>

          <Link href="/forgot-password"
            className="mt-4 block text-center text-xs text-ink-500 hover:text-ink-800">
            Forgotten your password?
          </Link>
        </form>
      </div>
    </main>
  );
}
