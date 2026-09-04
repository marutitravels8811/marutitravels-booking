"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { SeatMap, type SeatVisualState } from "@/components/seat-map/SeatMap";
import type { SeatLike } from "@/components/seat-map/geometry";
import { formatINR } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { pointKindsFor } from "@/lib/journey";
import { fetchEditTripSeatsAction, updateBookingAction } from "../../edit-actions";
import type {
  EditableBooking, EditablePoint, EditableTrip,
} from "@/server/services/booking";

type SeatOption = {
  seatId: string;
  seatNumber: string;
  deck: "UPPER" | "LOWER" | "CABIN";
  berthType: "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
  sofaGroupId: string | null;
  sofaPosition: "A" | "B" | null;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  status: string;
  bookingId: string | null;
};

type SeatDetail = {
  fare: string;
  extraPersonCount: string;
  extraPersonCharge: string;
};

type Trip = Omit<EditableTrip, "departureAt" | "arrivalAt"> & {
  departureAt: string;
  arrivalAt: string;
};

const emptyDetail = (fare = "0", extraCharge = "0"): SeatDetail => ({
  fare,
  extraPersonCount: "0", extraPersonCharge: extraCharge,
});

export function EditBookingForm({
  booking, trips, initialSeats, initialPoints,
}: {
  booking: EditableBooking;
  trips: Trip[];
  initialSeats: SeatOption[];
  initialPoints: EditablePoint[];
}) {
  const router = useRouter();
  const [tripId, setTripId] = useState(booking.tripId);
  const currentTrip = trips.find((t) => t.id === booking.tripId);
  const [serviceDate, setServiceDate] = useState(currentTrip?.serviceDate ?? "");
  const [routeId, setRouteId] = useState(currentTrip?.routeId ?? "");
  const [seatOptions, setSeatOptions] = useState(initialSeats);
  const [selected, setSelected] = useState<string[]>(
    booking.seats.map((s) => s.seatId),
  );
  const [details, setDetails] = useState<Record<string, SeatDetail>>(() =>
    Object.fromEntries(booking.seats.map((s) => [s.seatId, {
      fare: String((s.farePaise - s.extraPersonCount * s.extraPersonChargePaise) / 100),
      extraPersonCount: String(s.extraPersonCount),
      extraPersonCharge: String(s.extraPersonChargePaise / 100),
    }])),
  );
  const [points, setPoints] = useState(initialPoints);
  const [customerName, setCustomerName] = useState(booking.customerName);
  const [customerPhone, setCustomerPhone] = useState(booking.customerPhone);
  const [altPhone, setAltPhone] = useState(booking.altPhone ?? "");
  const [boardingPointId, setBoardingPointId] = useState(booking.boardingPointId ?? "");
  const [droppingPointId, setDroppingPointId] = useState(booking.droppingPointId ?? "");
  const [boardingName, setBoardingName] = useState(booking.boardingName ?? "");
  const [droppingName, setDroppingName] = useState(booking.droppingName ?? "");
  const [note, setNote] = useState(booking.note ?? "");
  const [paymentType, setPaymentType] = useState<"CASH" | "ONLINE" | "PENDING">(booking.paymentType);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const dateTrips = useMemo(() => trips.filter((t) => t.serviceDate === serviceDate), [trips, serviceDate]);
  const routeTrips = useMemo(() => dateTrips.filter((t) => t.routeId === routeId), [dateTrips, routeId]);
  const trip = trips.find((t) => t.id === tripId) ?? routeTrips[0] ?? dateTrips[0] ?? trips[0];
  const selectedOptions = useMemo(
    () => seatOptions.filter((s) => selected.includes(s.seatId)),
    [seatOptions, selected],
  );
  const originalTotal = booking.seats.reduce((sum, s) => sum + s.farePaise, 0);
  const total = selectedOptions.reduce((sum, s) => {
    const d = details[s.seatId] ?? emptyDetail(String(defaultFareFor(s)), String(defaultExtraChargeFor(s)));
    return sum + (Number(d.fare) || 0) * 100
      + (Number(d.extraPersonCount) || 0) * (Number(d.extraPersonCharge) || 0) * 100;
  }, 0);
  const adjustedAmountPaid = Math.max(0, booking.amountPaidPaise + total - originalTotal);
  const kinds = pointKindsFor(trip.direction);
  const pickups = points.filter((p) => p.kind === kinds.pickup);
  const drops = points.filter((p) => p.kind === kinds.drop);
  const mapSeats = seatOptions.map((s) => ({ ...s, id: s.seatId }));

  function defaultFareFor(s: SeatOption) {
    return (s.berthType === "CABIN" ? trip.fareCabinPaise
      : s.berthType === "SLEEPER_SINGLE" ? trip.fareSingleSofaPaise
        : trip.fareDoubleSofaPaise) / 100;
  }

  function defaultExtraChargeFor(s: SeatOption) {
    return (s.berthType === "SLEEPER_SINGLE" ? trip.extraPersonSinglePaise
      : s.berthType === "SLEEPER_DOUBLE" ? trip.extraPersonDoublePaise : 0) / 100;
  }

  function stateOf(s: SeatLike): SeatVisualState {
    const row = seatOptions.find((seat) => seat.seatId === (s as SeatOption).seatId);
    if (!row || !row.isActive) return "BLOCKED";
    if (selected.includes(row.seatId)) return "SELECTED";
    if (row.status === "BOOKED") return "BOOKED";
    if (row.status === "BLOCKED") return "BLOCKED";
    if (row.status === "HELD") return "HELD_BY_OTHER";
    return "AVAILABLE";
  }

  function titleOf(s: SeatLike) {
    const row = seatOptions.find((seat) => seat.seatId === (s as SeatOption).seatId);
    if (!row) return s.seatNumber;
    if (selected.includes(row.seatId)) return `${row.seatNumber} · selected`;
    if (row.status === "BOOKED") return `${row.seatNumber} · booked`;
    if (row.status === "HELD") return `${row.seatNumber} · held`;
    if (!row.isActive) return `${row.seatNumber} · not in service`;
    return `${row.seatNumber} · ${formatINR(defaultFareFor(row) * 100)}`;
  }

  function toggleSeat(id: string) {
    setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
    if (!details[id]) {
      const row = seatOptions.find((s) => s.seatId === id);
      setDetails((old) => ({
        ...old,
        [id]: emptyDetail(row ? String(defaultFareFor(row)) : "0", row ? String(defaultExtraChargeFor(row)) : "0"),
      }));
    }
  }

  function changeTrip(next: string) {
    setTripId(next);
    setError(null);
    start(async () => {
      const res = await fetchEditTripSeatsAction(next);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not load that trip.");
        return;
      }

      setSeatOptions(res.data.seats as SeatOption[]);
      setPoints(res.data.points);
      setSelected(next === booking.tripId ? booking.seats.map((s) => s.seatId) : []);
      setBoardingPointId(next === booking.tripId ? booking.boardingPointId ?? "" : "");
      setDroppingPointId(next === booking.tripId ? booking.droppingPointId ?? "" : "");
    });
  }

  function changeDate(nextDate: string) {
    const nextTrips = trips.filter((t) => t.serviceDate === nextDate);
    const nextRoute = nextTrips.find((t) => t.routeId === routeId)?.routeId ?? nextTrips[0]?.routeId ?? "";
    const nextTrip = nextTrips.find((t) => t.routeId === nextRoute);
    setServiceDate(nextDate);
    setRouteId(nextRoute);
    if (nextTrip) changeTrip(nextTrip.id);
  }

  function changeRoute(nextRoute: string) {
    const nextTrip = dateTrips.find((t) => t.routeId === nextRoute);
    setRouteId(nextRoute);
    if (nextTrip) changeTrip(nextTrip.id);
  }

  const fareDifference = total - originalTotal;

  function submit() {
    setConfirming(true);
  }

  function confirmSubmit() {
    setConfirming(false);
    setError(null);
    start(async () => {
      const res = await updateBookingAction({
        bookingId: booking.id, tripId, customerName, customerPhone, altPhone,
        boardingPointId: boardingPointId || null, droppingPointId: droppingPointId || null,
        boardingName: boardingPointId ? "" : boardingName,
        droppingName: droppingPointId ? "" : droppingName,
        note, paymentType, amountPaid: adjustedAmountPaid / 100,
        seats: selectedOptions.map((s) => {
          const d = details[s.seatId] ?? emptyDetail();
          return {
            seatId: s.seatId, fare: d.fare,
            extraPersonCount: Number(d.extraPersonCount || 0),
            extraPersonCharge: d.extraPersonCharge,
          };
        }),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not update booking.");
        return;
      }
      router.push(`/tickets/${booking.id}`);
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <p>{error}</p>
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-[var(--surface)] p-5 shadow-xl">
            <h2 className="text-base font-semibold text-ink-900">Confirm booking changes</h2>
            <div className="mt-4 space-y-2 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
              <p className="flex justify-between"><span>Previous total</span><strong>{formatINR(originalTotal)}</strong></p>
              <p className="flex justify-between"><span>New total</span><strong>{formatINR(total)}</strong></p>
              <p className="flex justify-between border-t border-[var(--border)] pt-2 font-semibold">
                <span>{fareDifference === 0 ? "Payment difference" : fareDifference > 0 ? "Additional payment" : "Payment reduction"}</span>
                <strong>{fareDifference === 0 ? "No change" : formatINR(Math.abs(fareDifference))}</strong>
              </p>
              <p className="flex justify-between"><span>Payment after update</span><strong>{formatINR(adjustedAmountPaid)}</strong></p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-ink-700">Go back</button>
              <button type="button" onClick={confirmSubmit}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                {fareDifference === 0 ? "Confirm booking" : "Confirm payment change"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TripBar trip={trip} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <main className="min-w-0">
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs font-medium text-ink-500">Allocated seat numbers</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {selectedOptions.length > 0 ? selectedOptions.map((s) => s.seatNumber).join(", ") : "No seats selected"}
            </p>
          </div>
          <SeatMap
            seats={mapSeats}
            sleeperRows={trip.sleeperRows}
            sleeperCols={trip.sleeperCols}
            cabinCols={trip.cabinCols}
            stateOf={stateOf}
            titleOf={titleOf}
            onSeatClick={(s) => toggleSeat((s as SeatOption).seatId)}
            disabledSeat={(s) => {
              const row = s as SeatOption;
              return !row.isActive || (row.status !== "AVAILABLE" &&
                !(row.status === "BOOKED" && row.bookingId === booking.id));
            }}
          />
        </main>

        <aside className="order-first flex flex-col gap-4 xl:order-none">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Booking details</h2>
            <div className="flex flex-col gap-3">
              <Field label="Travel date">
                <input type="date" value={serviceDate} onChange={(e) => changeDate(e.target.value)} className={input} />
              </Field>
              <Field label="Route">
                <select value={routeId} onChange={(e) => changeRoute(e.target.value)} className={input}>
                  <option value="">Select route</option>
                  {[...new Map(dateTrips.map((t) => [t.routeId, t.routeLabel])).entries()].map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Scheduled trip">
                <select value={tripId} onChange={(e) => changeTrip(e.target.value)} className={input}>
                  {routeTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.busName} · {formatTime(t.departureAt)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Customer name"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={input} /></Field>
              <Field label="Phone number"><input value={customerPhone} inputMode="tel" onChange={(e) => setCustomerPhone(e.target.value)} className={input} /></Field>
              <Field label="Alternate phone"><input value={altPhone} inputMode="tel" onChange={(e) => setAltPhone(e.target.value)} className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <StopField label="Pickup" value={boardingPointId} options={pickups}
                  onSelect={setBoardingPointId} onText={setBoardingName} text={boardingName} />
                <StopField label="Destination" value={droppingPointId} options={drops}
                  onSelect={setDroppingPointId} onText={setDroppingName} text={droppingName} />
              </div>
              <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} className={input} /></Field>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Payment</h2>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-1.5">
                {(["CASH", "ONLINE", "PENDING"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setPaymentType(value)}
                    className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition",
                      paymentType === value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-[var(--border)] text-ink-700 hover:bg-ink-50")}>
                    {value === "PENDING" ? "Pay later" : value === "ONLINE" ? "Online" : "Cash"}
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
                Amount paid after fare change: <strong>{formatINR(adjustedAmountPaid)}</strong>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={pending || selected.length === 0} onClick={submit}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes
                </button>
                <Link href={`/tickets/${booking.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-ink-700">Cancel</Link>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TripBar({ trip }: { trip: Trip }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      <div>
        <h1 className="text-sm font-semibold text-ink-900">
          {trip.routeLabel}
          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-600">{trip.direction}</span>
        </h1>
        <p className="mt-0.5 text-xs text-ink-500">{trip.busName} · {trip.registrationNo}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-ink-900">{formatTime(trip.departureAt)}</p>
        <p className="text-[11px] text-ink-500">{trip.serviceDate}</p>
      </div>
    </div>
  );
}

function StopField({ label, value, options, onSelect, onText, text }: {
  label: string; value: string; options: EditablePoint[]; onSelect: (value: string) => void;
  onText: (value: string) => void; text: string;
}) {
  return (
    <Field label={label}>
      {options.length > 0 ? (
        <>
          <select value={value} onChange={(e) => onSelect(e.target.value)} className={input}>
            <option value="">Type instead…</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!value && <input value={text} onChange={(e) => onText(e.target.value)} placeholder={`${label} point`} className={`${input} mt-2`} />}
        </>
      ) : (
        <input value={text} onChange={(e) => onText(e.target.value)} placeholder={`${label} point`} className={input} />
      )}
    </Field>
  );
}

const input = "w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-ink-700">{label}<span className="mt-1 block">{children}</span></label>;
}
