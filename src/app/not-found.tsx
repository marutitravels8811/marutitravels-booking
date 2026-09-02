import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
          <FileQuestion size={22} />
        </span>
        <h1 className="text-base font-semibold text-ink-900">Not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          That page, booking or trip does not exist. It may have been cancelled
          or removed by another agent.
        </p>
        <Link href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
