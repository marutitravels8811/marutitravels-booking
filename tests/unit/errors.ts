/**
 * The error mapper. These exist because the original bug was invisible:
 * friendly messages were written, never fired, and users saw raw SQL.
 */
import { toActionError, AppError, unwrapPgError } from "../../src/server/errors";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
};

/** How Drizzle actually presents a driver failure: SQL on top, cause beneath. */
function drizzleWrapped(pg: Record<string, unknown>) {
  const e = new Error('Failed query: insert into "trip" ("id", "route_id") values ($1, $2)');
  (e as unknown as { cause: unknown }).cause = pg;
  return e;
}

console.log("\x1b[1mUnwrapping\x1b[0m");
const wrapped = drizzleWrapped({ code: "23505", constraint: "trip_bus_date_dir_uq" });
check("finds the driver error under Drizzle's wrapper",
  unwrapPgError(wrapped)?.constraint === "trip_bus_date_dir_uq");
check("survives a second layer of wrapping", (() => {
  const outer = new Error("outer");
  (outer as unknown as { cause: unknown }).cause = wrapped;
  return unwrapPgError(outer)?.code === "23505";
})());
check("returns null for a plain error", unwrapPgError(new Error("nope")) === null);
check("ignores a non-SQLSTATE code",
  unwrapPgError({ code: "ENOENT" } as never) === null);

console.log("\n\x1b[1mThe reported bug\x1b[0m");
const dup = toActionError(drizzleWrapped({
  code: "23505", constraint: "trip_bus_date_dir_uq",
  detail: "Key (bus_id, service_date, direction)=(...) already exists.",
}));
check("a duplicate trip explains itself",
  dup.message.includes("already has a trip in this direction"), dup.message);
check("no SQL leaks into the message",
  !/insert into|select |\$1/i.test(dup.message), dup.message);
check("coded DUPLICATE", dup.code === "DUPLICATE");

console.log("\n\x1b[1mOther constraints\x1b[0m");
for (const [constraint, expect] of [
  ["bus_reg_uq", "registration number"],
  ["route_code_uq", "route already uses that code"],
  ["agent_email_uq", "email address"],
  ["seat_layout_number_uq", "same seat number"],
] as const) {
  const r = toActionError(drizzleWrapped({ code: "23505", constraint }));
  check(`${constraint} → readable`, r.message.includes(expect), r.message);
}
const unknownDup = toActionError(drizzleWrapped({ code: "23505", constraint: "brand_new_uq" }));
check("an unknown constraint still avoids leaking SQL",
  unknownDup.message.includes("already in use") && !unknownDup.message.includes("insert into"),
  unknownDup.message);

console.log("\n\x1b[1mOther SQLSTATEs\x1b[0m");
const fk = toActionError(drizzleWrapped({
  code: "23503", constraint: "seat_hold_agent_id_agent_id_fk",
  detail: 'Key (agent_id)=(5b3e) is not present in table "agent".',
}));
check("a missing agent reads as a missing record, not SQL",
  fk.message.includes("the agent record") && fk.message.includes("no longer exists"), fk.message);
const chk = toActionError(drizzleWrapped({ code: "23514", constraint: "held_needs_hold" }));
check("a check violation explains the seat state",
  chk.message.includes("Refresh the seat map"), chk.message);
const dead = toActionError(drizzleWrapped({ code: "40P01" }));
check("a deadlock reads as a retry, not a crash",
  dead.code === "CONFLICT" && dead.message.includes("try again"), dead.message);
const notNull = toActionError(drizzleWrapped({ code: "23502", column: "primary_phone" }));
check("a null violation names the column",
  notNull.message.includes("primary_phone"), notNull.message);

console.log("\n\x1b[1mApp and service errors\x1b[0m");
const app = toActionError(new AppError("LAST_AGENT", "This is the only active account.", "email"));
check("AppError passes its wording through", app.message === "This is the only active account.");
check("and its field", app.field === "email");
const svc = Object.assign(new Error("Seat U7 was just taken."), { name: "SeatConflictError", code: "SEAT_CONFLICT" });
check("a service error keeps its message", toActionError(svc).message.includes("U7"));
const unauth = toActionError(new Error("UNAUTHENTICATED"));
check("UNAUTHENTICATED becomes a sign-in prompt",
  unauth.message.includes("sign in again"), unauth.message);

console.log("\n\x1b[1mUnknowns never leak\x1b[0m");
const boom = toActionError(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2"));
check("an unexpected error is replaced wholesale",
  !boom.message.includes("hunter2") && !boom.message.includes("ECONNREFUSED"), boom.message);

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
