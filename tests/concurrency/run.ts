/**
 * The concurrency suite: CT-1 … CT-7 from docs/SRS.md §5.5.
 *
 * These tests are the reason the whole system uses Postgres. They run against
 * a real database — never a mock — because the guarantee being tested lives in
 * the database, not in application code.
 *
 *   pnpm test:concurrency
 */
import {
  makeFixture, seatCounts, findDoubleSells, findSeatsOnMultipleBookings,
  cleanup, shutdown, check, heading, report,
} from "./harness";
import {
  createHold, releaseHold, expireStaleHolds, getTripSeatStates,
  SeatConflictError, HoldError,
} from "../../src/server/services/seat-hold";
import { confirmBooking, cancelBooking } from "../../src/server/services/booking";

const settledOk = <T,>(rs: PromiseSettledResult<T>[]) =>
  rs.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled");
const settledErr = <T,>(rs: PromiseSettledResult<T>[]) =>
  rs.filter((r): r is PromiseRejectedResult => r.status === "rejected");

/* ── CT-1 · 50 parallel holds on one seat → exactly one winner ── */
async function ct1() {
  heading("CT-1 · 50 agents race for the same seat");
  const f = await makeFixture(4);
  const seatId = f.seatIds[7];

  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) =>
      createHold({
        tripId: f.tripId, seatIds: [seatId],
        agentId: f.agentIds[i % f.agentIds.length],
      })),
  );

  const ok = settledOk(results);
  const errs = settledErr(results);
  check("exactly one hold succeeds", ok.length === 1, `got ${ok.length}`);
  check("the other 49 fail", errs.length === 49, `got ${errs.length}`);
  check("every failure is a seat conflict",
    errs.every((e) => e.reason instanceof SeatConflictError),
    errs.map((e) => String(e.reason?.name)).filter((v, i, a) => a.indexOf(v) === i).join(", "));

  const counts = await seatCounts(f.tripId);
  check("exactly one seat is HELD", counts.HELD === 1, JSON.stringify(counts));
  check("no rolled-back hold left a mark", counts.AVAILABLE === f.seatIds.length - 1,
    JSON.stringify(counts));
  check("no structural double-sell", (await findDoubleSells(f.tripId)).length === 0);
}

/* ── CT-2 · overlapping multi-seat holds are all-or-nothing ── */
async function ct2() {
  heading("CT-2 · two agents grab overlapping 4-seat sets");
  const f = await makeFixture(2);
  const A = [f.seatIds[0], f.seatIds[1], f.seatIds[2], f.seatIds[3]];
  const B = [f.seatIds[3], f.seatIds[4], f.seatIds[5], f.seatIds[6]]; // overlaps on [3]

  const results = await Promise.allSettled([
    createHold({ tripId: f.tripId, seatIds: A, agentId: f.agentIds[0] }),
    createHold({ tripId: f.tripId, seatIds: B, agentId: f.agentIds[1] }),
  ]);

  const ok = settledOk(results);
  const errs = settledErr(results);
  check("exactly one set succeeds", ok.length === 1, `got ${ok.length}`);
  check("the loser gets a seat conflict",
    errs.length === 1 && errs[0].reason instanceof SeatConflictError);
  check("the conflict names the overlapping seat",
    errs[0]?.reason instanceof SeatConflictError &&
    (errs[0].reason as SeatConflictError).conflictingSeatIds.includes(f.seatIds[3]));

  const counts = await seatCounts(f.tripId);
  check("exactly 4 seats held, not 5 or 7", counts.HELD === 4, JSON.stringify(counts));
  check("the loser's seats are all free again",
    counts.AVAILABLE === f.seatIds.length - 4, JSON.stringify(counts));
}

/* ── CT-3 · an abandoned hold frees itself ── */
async function ct3() {
  heading("CT-3 · abandoned hold expires and the seat returns");
  const f = await makeFixture(2);
  const seatId = f.seatIds[10];

  // a hold that expired one minute ago, i.e. an agent who walked away
  await createHold({
    tripId: f.tripId, seatIds: [seatId], agentId: f.agentIds[0], ttlMinutes: -1,
  });

  const before = await getTripSeatStates(f.tripId);
  check("an expired hold reads as AVAILABLE without any sweep",
    before.seats.find((s) => s.seatId === seatId)?.status === "AVAILABLE");

  const taken = await createHold({
    tripId: f.tripId, seatIds: [seatId], agentId: f.agentIds[1],
  });
  check("another agent can immediately take the seat", !!taken.holdId);

  const swept = await expireStaleHolds();
  check("the sweeper reports the stale hold", swept.holds >= 1, JSON.stringify(swept));

  const after = await getTripSeatStates(f.tripId);
  check("the sweep did not disturb the new live hold",
    after.seats.find((s) => s.seatId === seatId)?.status === "HELD");
  check("no structural double-sell", (await findDoubleSells(f.tripId)).length === 0);
}

/* ── CT-4 · confirming an expired hold books nothing ── */
async function ct4() {
  heading("CT-4 · confirm against an expired hold is rejected cleanly");
  const f = await makeFixture(2);
  const seatId = f.seatIds[12];

  const hold = await createHold({
    tripId: f.tripId, seatIds: [seatId], agentId: f.agentIds[0], ttlMinutes: -1,
  });

  let err: unknown;
  try {
    await confirmBooking({
      holdId: hold.holdId, agentId: f.agentIds[0],
      customerName: "Ghost", customerPhone: "9999999999",
      seats: [{ seatId, farePaise: 80000 }],
      paymentType: "CASH",
    });
  } catch (e) { err = e; }

  check("it throws HOLD_EXPIRED",
    err instanceof HoldError && err.code === "HOLD_EXPIRED",
    err instanceof Error ? err.message : String(err));

  const counts = await seatCounts(f.tripId);
  check("no seat was booked", counts.BOOKED === 0, JSON.stringify(counts));
  check("no booking row survived",
    (await findSeatsOnMultipleBookings(f.tripId)).length === 0);
}

/* ── CT-5 · a hold cannot be booked twice ── */
async function ct5() {
  heading("CT-5 · double-submit of the same hold books once");
  const f = await makeFixture(2);
  const seats = [f.seatIds[20], f.seatIds[21]];

  const hold = await createHold({
    tripId: f.tripId, seatIds: seats, agentId: f.agentIds[0],
  });

  const payload = {
    holdId: hold.holdId, agentId: f.agentIds[0],
    customerName: "Divy", customerPhone: "9876543210",
    seats: seats.map((seatId) => ({ seatId, farePaise: 80000 })),
    paymentType: "CASH" as const,
  };

  // the agent double-clicks Confirm
  const results = await Promise.allSettled([
    confirmBooking(payload), confirmBooking(payload),
  ]);
  const ok = settledOk(results);

  check("exactly one booking is created", ok.length === 1, `got ${ok.length}`);
  check("the duplicate is refused", settledErr(results).length === 1);

  const counts = await seatCounts(f.tripId);
  check("exactly 2 seats booked", counts.BOOKED === 2, JSON.stringify(counts));
  check("no seat appears on two bookings",
    (await findSeatsOnMultipleBookings(f.tripId)).length === 0);
  check("the total charged is the sum of the seat fares",
    ok[0].value.amountTotalPaise === 160000, String(ok[0].value.amountTotalPaise));
}

/* ── CT-6 · book / cancel / rebook stays consistent ── */
async function ct6() {
  heading("CT-6 · 40 book-cancel-rebook cycles keep the invariant");
  const f = await makeFixture(3);
  const seatId = f.seatIds[30];
  const total = f.seatIds.length;

  for (let i = 0; i < 40; i++) {
    const agentId = f.agentIds[i % f.agentIds.length];
    const hold = await createHold({ tripId: f.tripId, seatIds: [seatId], agentId });
    const b = await confirmBooking({
      holdId: hold.holdId, agentId,
      customerName: `Cycle ${i}`, customerPhone: "9000000000",
      seats: [{ seatId, farePaise: 80000 }],
      paymentType: i % 3 === 0 ? "PENDING" : i % 3 === 1 ? "ONLINE" : "CASH",
    });
    await cancelBooking({
      bookingId: b.bookingId, agentId, reason: "test cycle",
    });
  }

  const counts = await seatCounts(f.tripId);
  check("every seat is free again", counts.AVAILABLE === total, JSON.stringify(counts));
  check("nothing is stuck HELD or BOOKED",
    counts.HELD === 0 && counts.BOOKED === 0, JSON.stringify(counts));
  check("no structural double-sell", (await findDoubleSells(f.tripId)).length === 0);
  check("no seat on two live bookings",
    (await findSeatsOnMultipleBookings(f.tripId)).length === 0);
}

/* ── CT-7 · opposite lock orders must not deadlock ── */
async function ct7() {
  heading("CT-7 · reversed seat orders do not deadlock");
  const f = await makeFixture(2);
  const forward = [f.seatIds[0], f.seatIds[1], f.seatIds[2]];
  const reverse = [...forward].reverse();

  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      createHold({
        tripId: f.tripId,
        seatIds: i % 2 === 0 ? forward : reverse,
        agentId: f.agentIds[i % 2],
      })),
  );

  const errs = settledErr(results);
  const deadlocks = errs.filter((e) => /deadlock/i.test(String(e.reason?.message ?? "")));
  check("no deadlock was reported by Postgres", deadlocks.length === 0,
    deadlocks.map((d) => String(d.reason?.message)).join("; "));
  check("exactly one holder wins", settledOk(results).length === 1,
    `got ${settledOk(results).length}`);

  const counts = await seatCounts(f.tripId);
  check("exactly 3 seats held", counts.HELD === 3, JSON.stringify(counts));
}

/* ── CT-8 · a full bus sells out exactly once ── */
async function ct8() {
  heading("CT-8 · 43 berths, 86 racing agents, sell out exactly once");
  const f = await makeFixture(4);

  // two competing requests per seat, all fired at once
  const attempts = f.seatIds.flatMap((seatId, i) => [
    createHold({ tripId: f.tripId, seatIds: [seatId], agentId: f.agentIds[i % 4] }),
    createHold({ tripId: f.tripId, seatIds: [seatId], agentId: f.agentIds[(i + 1) % 4] }),
  ]);
  const results = await Promise.allSettled(attempts);

  check("exactly 43 holds succeed", settledOk(results).length === f.seatIds.length,
    `got ${settledOk(results).length} of ${f.seatIds.length}`);
  check("exactly 43 fail", settledErr(results).length === f.seatIds.length,
    `got ${settledErr(results).length}`);

  const counts = await seatCounts(f.tripId);
  check("the whole bus is held, none available",
    counts.HELD === f.seatIds.length && counts.AVAILABLE === 0, JSON.stringify(counts));
  check("no structural double-sell", (await findDoubleSells(f.tripId)).length === 0);
}

async function main() {
  console.log("\x1b[1mConcurrency suite — SRS §5.5\x1b[0m");
  console.log(`database: ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ":***@")}`);

  for (const t of [ct1, ct2, ct3, ct4, ct5, ct6, ct7, ct8]) {
    await cleanup();
    await t();
  }
  await cleanup();

  const code = report();
  await shutdown();
  process.exit(code);
}

main().catch(async (e) => {
  console.error("\n\x1b[31mharness failure\x1b[0m", e);
  await shutdown();
  process.exit(1);
});
