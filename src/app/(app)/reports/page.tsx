import Link from "next/link";
import { Download, FileSpreadsheet, Wallet } from "lucide-react";
import { formatINR } from "@/lib/money";
import { getReportSummary, validReportRange } from "@/server/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const range = validReportRange(sp.from, sp.to);
  const summary = await getReportSummary(range);
  const query = `from=${range.from}&to=${range.to}`;

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-ink-900">Reports</h1>
        <p className="text-sm text-ink-500">Bookings are counted by booking date. Finance is counted by travel date.</p>
      </header>
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink-700">From<input name="from" type="date" defaultValue={range.from}
          className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-2 text-sm" /></label>
        <label className="text-xs font-medium text-ink-700">To<input name="to" type="date" defaultValue={range.to}
          className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-2 text-sm" /></label>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Apply range</button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2"><FileSpreadsheet size={18} className="text-brand-600" />
            <h2 className="font-semibold text-ink-900">Booking activity</h2></div>
          <p className="text-3xl font-semibold text-ink-900">{summary.bookingCount}</p>
          <p className="mt-1 text-sm text-ink-500">Bookings created in this range, regardless of travel date.</p>
          <Link href={`/api/reports/export?kind=bookings&${query}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Download size={15} /> Download bookings Excel
          </Link>
        </section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2"><Wallet size={18} className="text-emerald-600" />
            <h2 className="font-semibold text-ink-900">Finance / travelled</h2></div>
          <p className="text-3xl font-semibold text-ink-900">{summary.travelledBookings}</p>
          <p className="mt-1 text-sm text-ink-500">{summary.travelledSeats} seats · {formatINR(summary.travelledTotalPaise)} total · {formatINR(summary.travelledPaidPaise)} paid</p>
          <p className="mt-1 text-xs text-ink-400">Cancelled bookings are excluded.</p>
          <Link href={`/api/reports/export?kind=finance&${query}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Download size={15} /> Download finance Excel
          </Link>
        </section>
      </div>
    </div>
  );
}
