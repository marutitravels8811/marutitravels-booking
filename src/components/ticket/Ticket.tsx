import { formatINR } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { contactLine, type OfficeDetails } from "@/lib/office";
import { journeyOf } from "@/lib/journey";
import type { TicketData } from "@/server/services/ticket";

const PAYMENT_LABEL: Record<TicketData["paymentType"], string> = {
  CASH: "Cash", ONLINE: "Online", PENDING: "Pay later",
};

const BERTH_SHORT: Record<TicketData["seats"][number]["berthType"], string> = {
  SLEEPER_SINGLE: "Single", SLEEPER_DOUBLE: "Double", CABIN: "Cabin",
};

const DECK_SHORT: Record<TicketData["seats"][number]["deck"], string> = {
  UPPER: "Up", LOWER: "Lo", CABIN: "Cab",
};

function shortDate(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  });
}

function stamp(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: process.env.OFFICE_TIMEZONE ?? "Asia/Kolkata",
  }).format(d);
}

/**
 * One ticket.
 *
 * Sizing and which optional blocks appear are driven entirely by CSS keyed off
 * the sheet's print format, not by a prop: the format toggle is client state
 * and the ticket is rendered on the server, so switching between 8-per-page and
 * A5 has to work without re-rendering this markup.
 *
 * Blocks carrying `t-extra` are dropped on the dense A4 formats — the postal
 * address, the per-berth breakdown, and the terms are all things a passenger at
 * the boarding point does not need.
 */
export function Ticket({
  ticket, office,
}: { ticket: TicketData; office: OfficeDetails }) {
  const due = ticket.amountTotalPaise - ticket.amountPaidPaise;
  const cancelled = ticket.status === "CANCELLED";
  const seatList = ticket.seats.map((s) => s.seatNumber).join(", ");
  const journey = journeyOf(ticket.origin, ticket.destination, ticket.direction);
  const showBreakdown =
    ticket.seats.length > 1 || ticket.seats.some((s) => s.passengerName);

  return (
    <article className="ticket">
      {cancelled && (
        <span aria-hidden className="t-void">CANCELLED</span>
      )}

      <header className="t-head">
        <span className="t-op">{office.name}</span>
        {contactLine(office) && <span className="t-contact">{contactLine(office)}</span>}
        <span className="t-pnr">{ticket.pnr}</span>
      </header>

      <div className="t-band">
        <span className="t-route">
          {journey.from} <span className="t-arrow">→</span> {journey.to}
        </span>
        <span className="t-when">
          {shortDate(ticket.serviceDate)} · {formatTime(ticket.departureAt)}
        </span>
      </div>

      <div className="t-main">
        <div className="t-who">
          <p className="t-name">{ticket.customerName}</p>
          <p className="t-sub">
            {ticket.customerPhone}
            <span className="t-dim"> · {ticket.busName} {ticket.registrationNo}</span>
          </p>
        </div>
        <div className="t-seatbox">
          <p className="t-seatlabel">
            {ticket.seats.length === 1 ? "Seat" : `Seats ${ticket.seats.length}`}
          </p>
          <p className="t-seats">{seatList}</p>
        </div>
      </div>

      <p className="t-stops">
        <span className="t-dim">Pickup</span> {ticket.boardingName ?? "As advised"}
        <span className="t-dim"> → Drop</span> {ticket.droppingName ?? "As advised"}
      </p>

      {showBreakdown && (
        <table className="t-extra t-detail">
          <thead>
            <tr>
              <th>Berth</th><th>Type</th><th>Passenger</th><th className="t-right">Fare</th>
            </tr>
          </thead>
          <tbody>
            {ticket.seats.map((s) => (
              <tr key={s.seatNumber}>
                <td className="t-strong">{s.seatNumber}</td>
                <td className="t-dim">{BERTH_SHORT[s.berthType]} · {DECK_SHORT[s.deck]}</td>
                <td className="t-dim">{s.passengerName || "—"}</td>
                <td className="t-right">{formatINR(s.farePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ticket.note && <p className="t-note">{ticket.note}</p>}

      <div className="t-money">
        <span className="t-pay">
          {PAYMENT_LABEL[ticket.paymentType]}
          {due > 0
            ? <span className="t-due"> {formatINR(due)} TO COLLECT</span>
            : <span className="t-paid"> Paid</span>}
        </span>
        <span className="t-total">{formatINR(ticket.amountTotalPaise)}</span>
      </div>

      <footer className="t-foot">
        <span className="t-extra t-terms">{office.terms.join(" · ")}</span>
        <span className="t-by">{ticket.bookedByName} · {stamp(ticket.bookedAt)}</span>
      </footer>
    </article>
  );
}
