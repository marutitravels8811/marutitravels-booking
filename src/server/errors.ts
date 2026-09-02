/**
 * One place that turns anything thrown into something an agent can read.
 *
 * The reason this exists: Drizzle wraps driver failures in its own error whose
 * `message` is the raw SQL. The useful parts — the SQLSTATE code and the
 * constraint that was violated — are on `cause`. Checking `error.message` for a
 * constraint name therefore never matches, and the agent sees a page of SQL.
 * Every server action funnels through `toActionError` instead.
 */

/** A failure we raised deliberately, with wording meant for the agent. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface PgErrorShape {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  message?: string;
}

/** Dig the driver error out of however many wrappers sit on top of it. */
export function unwrapPgError(e: unknown): PgErrorShape | null {
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 6; depth++) {
    const c = cur as PgErrorShape & { cause?: unknown };
    // a SQLSTATE is five alphanumerics; that is what identifies a driver error
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    cur = c.cause;
  }
  return null;
}

/**
 * Constraint name → what to tell the agent.
 *
 * Keyed on the constraint rather than the message so renaming a column cannot
 * silently break the wording, and so a new constraint shows up as the generic
 * fallback rather than as leaked SQL.
 */
const UNIQUE_MESSAGES: Record<string, { message: string; field?: string }> = {
  agent_email_uq: {
    message: "Another agent already uses that email address.", field: "email" },
  route_code_uq: {
    message: "Another route already uses that code.", field: "code" },
  bus_reg_uq: {
    message: "Another bus already uses that registration number.",
    field: "registrationNo" },
  layout_bus_version_uq: {
    message: "That seat layout version already exists for this bus." },
  seat_layout_number_uq: {
    message: "Two berths share the same seat number. Seat numbers must be unique within a layout." },
  seat_layout_cell_uq: {
    message: "Two berths are placed in the same position on the seat map." },
  trip_bus_date_dir_uq: {
    message: "That bus already has a trip in this direction on that date. Pick a different bus, date or direction." },
  booking_pnr_uq: {
    message: "Could not allocate a unique ticket number. Please try again." },
  password_reset_pending_uq: {
    message: "A password reset is already waiting for approval for this agent." },
};

const CHECK_MESSAGES: Record<string, string> = {
  held_needs_hold:
    "A seat cannot be marked as held without a reservation. Refresh the seat map and try again.",
  booked_needs_booking:
    "A seat cannot be marked as booked without a booking. Refresh the seat map and try again.",
  double_needs_position:
    "Each berth of a double sofa must be paired with its partner.",
};

/** Foreign key columns → the thing that is actually missing. */
const FK_HINTS: Record<string, string> = {
  agent_id: "the agent record",
  route_id: "the route",
  bus_id: "the bus",
  layout_id: "the seat layout",
  trip_id: "the trip",
  seat_id: "the seat",
  booking_id: "the booking",
  hold_id: "the reservation",
  boarding_point_id: "the pickup point",
  dropping_point_id: "the drop point",
};

function fkSubject(constraint: string | undefined, detail: string | undefined): string {
  const source = `${constraint ?? ""} ${detail ?? ""}`;
  for (const [col, label] of Object.entries(FK_HINTS)) {
    if (source.includes(col)) return label;
  }
  return "a linked record";
}

export interface ActionError {
  code: string;
  /** safe to show an agent */
  message: string;
  /** form field to highlight, when the failure points at one */
  field?: string;
}

/**
 * Turn anything thrown into a message worth showing.
 *
 * Never returns raw SQL: an unrecognised failure becomes a generic message, and
 * the original is logged server-side where it belongs.
 */
export function toActionError(e: unknown, context = "action"): ActionError {
  if (e instanceof AppError) {
    return { code: e.code, message: e.message, field: e.field };
  }

  // errors from the services carry their own codes and wording already
  const named = e as { name?: string; code?: string; message?: string };
  if (named?.name && ["SeatConflictError", "HoldError", "BookingError",
                      "TripError", "LayoutError"].includes(named.name)) {
    return {
      code: named.code ?? named.name,
      message: named.message ?? "That action could not be completed.",
    };
  }

  if (named?.message === "UNAUTHENTICATED") {
    return { code: "UNAUTHENTICATED",
             message: "Your session has ended. Please sign in again." };
  }

  const pg = unwrapPgError(e);
  if (pg) {
    switch (pg.code) {
      case "23505": { // unique_violation
        const known = pg.constraint ? UNIQUE_MESSAGES[pg.constraint] : undefined;
        if (known) return { code: "DUPLICATE", ...known };
        return { code: "DUPLICATE",
                 message: "That value is already in use. Please choose another." };
      }
      case "23503": // foreign_key_violation
        return { code: "MISSING_REFERENCE",
                 message: `This refers to ${fkSubject(pg.constraint, pg.detail)}, which no longer exists. Refresh the page and try again.` };
      case "23514": { // check_violation
        const known = pg.constraint ? CHECK_MESSAGES[pg.constraint] : undefined;
        return { code: "INVALID_STATE",
                 message: known ?? "That change would leave the data in an invalid state." };
      }
      case "23502": // not_null_violation
        return { code: "MISSING_FIELD",
                 message: `${pg.column ? `"${pg.column}"` : "A required field"} cannot be empty.` };
      case "22001": // string_data_right_truncation
        return { code: "TOO_LONG", message: "One of the values is too long." };
      case "22P02": // invalid_text_representation
        return { code: "BAD_FORMAT", message: "One of the values is not in a valid format." };
      case "40001": // serialization_failure
      case "40P01": // deadlock_detected
        return { code: "CONFLICT",
                 message: "Another agent changed this at the same moment. Please try again." };
      case "57014": // query_canceled
        return { code: "TIMEOUT", message: "That took too long. Please try again." };
      case "53300": // too_many_connections
      case "08006": // connection_failure
      case "08003":
        return { code: "DB_UNAVAILABLE",
                 message: "The database is busy. Wait a moment and try again." };
    }
    logUnexpected(context, e, pg);
    return { code: `DB_${pg.code ?? "ERROR"}`,
             message: "Something went wrong saving that. Please try again." };
  }

  logUnexpected(context, e, null);
  return { code: "UNKNOWN",
           message: "Something went wrong. Please try again, and tell the office if it keeps happening." };
}

function logUnexpected(context: string, e: unknown, pg: PgErrorShape | null) {
  console.error(`[${context}] unhandled error`, {
    name: (e as Error)?.name,
    message: (e as Error)?.message,
    pgCode: pg?.code,
    constraint: pg?.constraint,
    detail: pg?.detail,
  });
}

/** The shape every server action returns. */
export interface ActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

export function failure<T = undefined>(e: unknown, context?: string): ActionResult<T> {
  const err = toActionError(e, context);
  return {
    ok: false,
    error: err.message,
    code: err.code,
    fieldErrors: err.field ? { [err.field]: err.message } : undefined,
  };
}

export function success<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

/** Collapse a Zod error into per-field messages. */
export function zodFailure<T = undefined>(
  e: { issues: { path: PropertyKey[]; message: string }[] },
): ActionResult<T> {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) {
    const key = i.path.map(String).join(".");
    if (!fieldErrors[key]) fieldErrors[key] = i.message;
  }
  return {
    ok: false,
    code: "VALIDATION_FAILED",
    error: e.issues[0]?.message ?? "Please check the form and try again.",
    fieldErrors,
  };
}
