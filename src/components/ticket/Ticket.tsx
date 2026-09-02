import { formatINR } from "@/lib/money";
import { formatDateTime, formatTime, OFFICE_TZ } from "@/lib/time";
import type { OfficeDetails } from "@/lib/office";
import type { TicketData } from "@/server/services/ticket";

const PAYMENT_LABEL: Record<TicketData["paymentType"], string> = {
  CASH: "Cash", ONLINE: "Online", PENDING: "Pay later",
};

const BERTH_LABEL: Record<TicketData["seats"][number]["berthType"], string> = {
  SLEEPER_SINGLE: "Single sleeper",
  SLEEPER_DOUBLE: "Double sleeper",
  CABIN: "Cabin",
};

const DECK_LABEL: Record<TicketData["seats"][number]["deck"], string> = {
  UPPER: "Upper", LOWER: "Lower", CABIN: "Cabin",
};

function longDate(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    timeZone: "UTC",
  });
}

export function Ticket({
  ticket, office, compact = false,
}: { ticket: TicketData; office: OfficeDetails; compact?: boolean }) {
  const due = ticket.amountTotalPaise - ticket.amountPaidPaise;
  const cancelled = ticket.status === "CANCELLED";

  return (
    <article className="ticket relative mx-auto flex flex-col rounded-lg border border-ink-300 bg-white p-4 text-ink-900">
      {cancelled && (
        <span aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-12 rounded border-4 border-red-600 px-6 py-2 text-3xl font-black tracking-widest text-red-600 opacity-30">
            CANCELLED
          </span>
        </span>
      )}

      {/* operator */}
      <header className="flex items-start justify-between gap-3 border-b border-ink-300 pb-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight">{office.name}</h1>
          {office.tagline && (
            <p className="muted truncate text-[10px] text-ink-500">{office.tagline}</p>
          )}
          <p className="muted mt-0.5 text-[10px] leading-snug text-ink-600">
            {[office.phone, office.altPhone].filter(Boolean).join(" · ")}
            {office.address && <span className="block">{office.address}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="muted text-[9px] uppercase tracking-widest text-ink-500">
            Ticket no.
          </p>
          <p className="font-mono text-sm font-bold tracking-wider">{ticket.pnr}</p>
          {office.gstin && (
            <p className="muted text-[9px] text-ink-500">GSTIN {office.gstin}</p>
          )}
        </div>
      </header>

      {/* journey */}
      <div className="band -mx-4 mt-2 bg-ink-50 px-4 py-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">
              {ticket.origin} <span className="font-normal text-ink-500">→</span> {ticket.destination}
            </p>
            <p className="muted text-[10px] text-ink-600">
              {ticket.routeCode} · {ticket.direction === "ONWARD" ? "Onward" : "Return"} ·
              {" "}{ticket.busName} ({ticket.registrationNo})
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold leading-tight tabular-nums">
              {formatTime(ticket.departureAt)}
            </p>
            <p className="muted text-[10px] text-ink-600">{longDate(ticket.serviceDate)}</p>
          </div>
        </div>
      </div>

      {/* passenger + stops */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Field label="Passenger" value={ticket.customerName} strong />
        <Field label="Mobile" value={ticket.customerPhone} strong />
        <Field label="Pickup" value={ticket.boardingName ?? "As advised"} />
        <Field label="Drop" value={ticket.droppingName ?? "As advised"} />
      </div>

      {/* seats */}
      <div className="mt-2 border-t border-ink-200 pt-2">
        <div className="flex items-baseline justify-between">
          <p className="muted text-[9px] uppercase tracking-widest text-ink-500">
            {ticket.seats.length === 1 ? "Seat" : `Seats (${ticket.seats.length})`}
          </p>
          <p className="text-sm font-bold tracking-wide">
            {ticket.seats.map((s) => s.seatNumber).join(" · ")}
          </p>
        </div>

        {!compact && ticket.seats.length > 0 && (
          <table className="mt-1.5 w-full text-[10px]">
            <thead>
              <tr className="muted border-b border-ink-200 text-left text-ink-500">
                <th className="py-0.5 font-medium">Berth</th>
                <th className="py-0.5 font-medium">Type</th>
                <th className="py-0.5 font-medium">Passenger</th>
                <th className="py-0.5 text-right font-medium">Fare</th>
              </tr>
            </thead>
            <tbody>
              {ticket.seats.map((s) => (
                <tr key={s.seatNumber} className="border-b border-ink-100 last:border-0">
                  <td className="py-0.5 font-semibold">{s.seatNumber}</td>
                  <td className="muted py-0.5 text-ink-600">
                    {BERTH_LABEL[s.berthType]}
                    <span className="text-ink-400"> · {DECK_LABEL[s.deck]}</span>
                  </td>
                  <td className="muted py-0.5 text-ink-600">
                    {s.passengerName || "—"}
                    {s.age ? <span className="text-ink-400"> · {s.age}</span> : null}
                    {s.gender ? <span className="text-ink-400"> {s.gender}</span> : null}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{formatINR(s.farePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* money */}
      <div className="mt-2 flex items-end justify-between border-t border-ink-300 pt-2">
        <div>
          <p className="muted text-[9px] uppercase tracking-widest text-ink-500">Payment</p>
          <p className="text-xs font-semibold">
            {PAYMENT_LABEL[ticket.paymentType]}
            <span className={
              ticket.paymentStatus === "PAID" ? " text-emerald-700"
                : ticket.paymentStatus === "PARTIAL" ? " text-amber-700" : " text-red-700"}>
              {" "}· {ticket.paymentStatus === "PAID" ? "Paid"
                    : ticket.paymentStatus === "PARTIAL" ? "Part paid" : "Unpaid"}
            </span>
          </p>
          {due > 0 && (
            <p className="text-[10px] font-semibold text-red-700">
              {formatINR(due)} to collect
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="muted text-[9px] uppercase tracking-widest text-ink-500">Total</p>
          <p className="text-lg font-black leading-none tabular-nums">
            {formatINR(ticket.amountTotalPaise)}
          </p>
        </div>
      </div>

      {ticket.note && (
        <p className="muted mt-1.5 text-[10px] italic text-ink-600">Note: {ticket.note}</p>
      )}

      {/* provenance + terms */}
      <footer className="mt-auto border-t border-ink-200 pt-1.5">
        <p className="muted text-[9px] leading-snug text-ink-500">
          Booked by <strong className="font-semibold text-ink-700">{ticket.bookedByName}</strong>
          {" "}on {formatDateTime(ticket.bookedAt)} ({OFFICE_TZ})
        </p>
        {!compact && office.terms.length > 0 && (
          <ol className="muted mt-1 list-inside list-decimal text-[8.5px] leading-snug text-ink-500">
            {office.terms.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        )}
      </footer>
    </article>
  );
}

function Field({ label, value, strong }: {
  label: string; value: string; strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="muted text-[9px] uppercase tracking-widest text-ink-500">{label}</p>
      <p className={`truncate text-xs ${strong ? "font-semibold" : ""}`}>{value}</p>
    </div>
  );
}
