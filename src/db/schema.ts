import {
  pgTable, pgEnum, uuid, text, integer, smallint, bigint, boolean,
  timestamp, jsonb, primaryKey, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

/* ────────────────────────────── enums ────────────────────────────── */

export const deckEnum = pgEnum("deck", ["UPPER", "LOWER", "CABIN"]);
export const berthTypeEnum = pgEnum("berth_type", [
  "SLEEPER_SINGLE",
  "SLEEPER_DOUBLE",
  "CABIN",
]);
export const sofaPositionEnum = pgEnum("sofa_position", ["A", "B"]);
export const directionEnum = pgEnum("direction", ["ONWARD", "RETURN"]);
export const tripStatusEnum = pgEnum("trip_status", [
  "SCHEDULED", "DEPARTED", "CANCELLED", "COMPLETED",
]);
export const seatStatusEnum = pgEnum("seat_status", [
  "AVAILABLE", "HELD", "BOOKED", "BLOCKED",
]);
export const holdStatusEnum = pgEnum("hold_status", [
  "ACTIVE", "CONSUMED", "RELEASED", "EXPIRED",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "CONFIRMED", "CANCELLED", "NO_SHOW", "COMPLETED",
]);
export const paymentTypeEnum = pgEnum("payment_type", [
  "CASH",    // collected at the counter
  "ONLINE",  // UPI / card / transfer — anything already settled electronically
  "PENDING", // pay later, or collected on the bus by the conductor
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PAID", "PARTIAL", "UNPAID",
]);
export const doubleSofaPolicyEnum = pgEnum("double_sofa_policy", [
  "INDEPENDENT", "PAIRED", "SOFT_PAIR",
]);
export const genderEnum = pgEnum("gender", ["M", "F", "O"]);

/* ────────────────────────────── agent ────────────────────────────── */

export const agent = pgTable("agent", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  /** set when a password was issued by someone else; forces a change at login */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("agent_email_uq").on(t.email)]);

export const passwordResetStatusEnum = pgEnum("password_reset_status", [
  "PENDING", "COMPLETED", "CANCELLED", "EXPIRED",
]);

/**
 * A request to have a password reissued.
 *
 * There is no mail server in this deployment, and adding one for a single
 * office would be a cost and a dependency for something a colleague can settle
 * in ten seconds. So a forgotten password becomes a request that any signed-in
 * agent can approve, which issues a one-time password shown once on screen and
 * read out to the person. Every step is audited, and the partial unique index
 * stops a queue of duplicate requests building up for one agent.
 */
export const passwordReset = pgTable("password_reset", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agent.id, { onDelete: "cascade" }),
  status: passwordResetStatusEnum("status").notNull().default("PENDING"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  requestedIp: text("requested_ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedBy: uuid("approved_by").references(() => agent.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  note: text("note"),
}, (t) => [
  index("password_reset_agent_idx").on(t.agentId, t.status),
  index("password_reset_status_idx").on(t.status, t.requestedAt),
  uniqueIndex("password_reset_pending_uq").on(t.agentId)
    .where(sql`${t.status} = 'PENDING'`),
]);

/* ────────────────────────────── route ────────────────────────────── */

export const route = pgTable("route", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  distanceKm: integer("distance_km"),
  defaultDurationMin: integer("default_duration_min"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("route_code_uq").on(t.code)]);

export const boardingPoint = pgTable("boarding_point", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => route.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  sequence: integer("sequence").notNull().default(0),
  offsetMinutes: integer("offset_minutes").notNull().default(0),
  kind: text("kind").notNull().default("BOARDING"), // BOARDING | DROPPING
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("boarding_point_route_idx").on(t.routeId, t.kind, t.sequence)]);

/* ──────────────────────────── bus + layout ───────────────────────── */

export const bus = pgTable("bus", {
  id: uuid("id").primaryKey().defaultRandom(),
  registrationNo: text("registration_no").notNull(),
  displayName: text("display_name").notNull(),
  note: text("note"),
  currentLayoutId: uuid("current_layout_id"),
  /**
   * Default price per berth type, in paise. These are the numbers the counter
   * sees pre-filled when booking; the agent can still change the amount on any
   * individual booking.
   */
  fareSingleSofaPaise: bigint("fare_single_sofa_paise", { mode: "number" }).notNull().default(0),
  fareDoubleSofaPaise: bigint("fare_double_sofa_paise", { mode: "number" }).notNull().default(0),
  fareCabinPaise: bigint("fare_cabin_paise", { mode: "number" }).notNull().default(0),
  extraPersonSinglePaise: bigint("extra_person_single_paise", { mode: "number" }).notNull().default(0),
  extraPersonDoublePaise: bigint("extra_person_double_paise", { mode: "number" }).notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("bus_reg_uq").on(t.registrationNo)]);

export const seatLayout = pgTable("seat_layout", {
  id: uuid("id").primaryKey().defaultRandom(),
  busId: uuid("bus_id").notNull().references(() => bus.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  name: text("name").notNull(),
  doubleSofaPolicy: doubleSofaPolicyEnum("double_sofa_policy").notNull().default("INDEPENDENT"),
  /** grid dimensions per deck, so the editor and renderer agree */
  sleeperRows: integer("sleeper_rows").notNull().default(6),
  sleeperCols: integer("sleeper_cols").notNull().default(4),
  cabinRows: integer("cabin_rows").notNull().default(1),
  cabinCols: integer("cabin_cols").notNull().default(5),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdBy: uuid("created_by").references(() => agent.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("layout_bus_version_uq").on(t.busId, t.version)]);

export const seat = pgTable("seat", {
  id: uuid("id").primaryKey().defaultRandom(),
  layoutId: uuid("layout_id").notNull().references(() => seatLayout.id, { onDelete: "cascade" }),
  seatNumber: text("seat_number").notNull(),
  deck: deckEnum("deck").notNull(),
  berthType: berthTypeEnum("berth_type").notNull(),
  /** both berths of one double sofa share this id */
  sofaGroupId: uuid("sofa_group_id"),
  sofaPosition: sofaPositionEnum("sofa_position"),
  rowIndex: integer("row_index").notNull(),
  colIndex: integer("col_index").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [
  uniqueIndex("seat_layout_number_uq").on(t.layoutId, t.seatNumber),
  uniqueIndex("seat_layout_cell_uq").on(t.layoutId, t.deck, t.rowIndex, t.colIndex),
  index("seat_layout_idx").on(t.layoutId),
  index("seat_sofa_group_idx").on(t.sofaGroupId),
  check("double_needs_position", sql`
    (${t.berthType} <> 'SLEEPER_DOUBLE')
    OR (${t.sofaGroupId} IS NOT NULL AND ${t.sofaPosition} IS NOT NULL)
  `),
]);

/* ──────────────────────── schedules and trips ────────────────────── */

export const scheduleTemplate = pgTable("schedule_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => route.id, { onDelete: "cascade" }),
  direction: directionEnum("direction").notNull(),
  busId: uuid("bus_id").notNull().references(() => bus.id),
  departureTime: text("departure_time").notNull(), // "21:00"
  arrivalTime: text("arrival_time").notNull(),
  daysOfWeek: smallint("days_of_week").array().notNull(), // 0=Sun .. 6=Sat
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
});

export const trip = pgTable("trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => route.id),
  direction: directionEnum("direction").notNull(),
  busId: uuid("bus_id").notNull().references(() => bus.id),
  layoutId: uuid("layout_id").notNull().references(() => seatLayout.id),
  serviceDate: text("service_date").notNull(), // YYYY-MM-DD, office-local
  departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
  arrivalAt: timestamp("arrival_at", { withTimezone: true }).notNull(),
  status: tripStatusEnum("status").notNull().default("SCHEDULED"),
  templateId: uuid("template_id").references(() => scheduleTemplate.id),
  totalSeats: integer("total_seats").notNull(),
  createdBy: uuid("created_by").references(() => agent.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("trip_bus_date_dir_uq").on(t.busId, t.serviceDate, t.direction),
  index("trip_lookup_idx").on(t.serviceDate, t.routeId, t.direction, t.status),
]);

/* ───────────────── the concurrency-critical seat state ───────────── */

export const seatHold = pgTable("seat_hold", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id").notNull().references(() => trip.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agent.id),
  status: holdStatusEnum("status").notNull().default("ACTIVE"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  extensionCount: integer("extension_count").notNull().default(0),
  provisionalName: text("provisional_name"),
  provisionalPhone: text("provisional_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releasedBy: uuid("released_by").references(() => agent.id),
  releaseReason: text("release_reason"),
}, (t) => [
  index("hold_active_expiry_idx").on(t.expiresAt),
  index("hold_trip_idx").on(t.tripId, t.status),
  index("hold_agent_idx").on(t.agentId, t.status),
]);

export const booking = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  pnr: text("pnr").notNull(),
  tripId: uuid("trip_id").notNull().references(() => trip.id),
  primaryPassengerName: text("primary_passenger_name").notNull(),
  primaryPhone: text("primary_phone").notNull(),
  altPhone: text("alt_phone"),
  email: text("email"),
  amountTotalPaise: bigint("amount_total_paise", { mode: "number" }).notNull(),
  amountPaidPaise: bigint("amount_paid_paise", { mode: "number" }).notNull().default(0),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("PAID"),
  status: bookingStatusEnum("status").notNull().default("CONFIRMED"),
  boardingPointId: uuid("boarding_point_id").references(() => boardingPoint.id),
  droppingPointId: uuid("dropping_point_id").references(() => boardingPoint.id),
  /**
   * Text snapshots of the pickup and destination as they read at booking time.
   * Kept alongside the ids so a printed ticket never changes meaning when a
   * point is later renamed or removed, and so an agent can type a one-off
   * pickup that is not in the route's list.
   */
  boardingName: text("boarding_name"),
  droppingName: text("dropping_name"),
  note: text("note"),
  holdId: uuid("hold_id").references(() => seatHold.id),
  createdByAgentId: uuid("created_by_agent_id").notNull().references(() => agent.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByAgentId: uuid("updated_by_agent_id").references(() => agent.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => agent.id),
  cancelReason: text("cancel_reason"),
  refundPaise: bigint("refund_paise", { mode: "number" }),
}, (t) => [
  uniqueIndex("booking_pnr_uq").on(t.pnr),
  index("booking_trip_idx").on(t.tripId),
  index("booking_phone_idx").on(t.primaryPhone),
  index("booking_created_idx").on(t.createdAt),
  index("booking_agent_idx").on(t.createdByAgentId, t.createdAt),
]);

/**
 * One row per (trip, seat). The composite primary key IS the mutual-exclusion
 * mechanism: there is exactly one physical row to contend for per berth.
 */
export const tripSeatState = pgTable("trip_seat_state", {
  tripId: uuid("trip_id").notNull().references(() => trip.id, { onDelete: "cascade" }),
  seatId: uuid("seat_id").notNull().references(() => seat.id),
  status: seatStatusEnum("status").notNull().default("AVAILABLE"),
  holdId: uuid("hold_id").references(() => seatHold.id, { onDelete: "set null" }),
  bookingId: uuid("booking_id").references(() => booking.id, { onDelete: "set null" }),
  heldUntil: timestamp("held_until", { withTimezone: true }),
  blockReason: text("block_reason"),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.tripId, t.seatId] }),
  index("tss_trip_status_idx").on(t.tripId, t.status),
  index("tss_held_until_idx").on(t.heldUntil),
  check("held_needs_hold", sql`
    ${t.status} <> 'HELD' OR (${t.holdId} IS NOT NULL AND ${t.heldUntil} IS NOT NULL)
  `),
  check("booked_needs_booking", sql`
    ${t.status} <> 'BOOKED' OR ${t.bookingId} IS NOT NULL
  `),
]);

export const bookingSeat = pgTable("booking_seat", {
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  seatId: uuid("seat_id").notNull().references(() => seat.id),
  passengerName: text("passenger_name"),
  age: integer("age"),
  gender: genderEnum("gender"),
  farePaise: bigint("fare_paise", { mode: "number" }).notNull().default(0),
  /** Number of passengers sharing this berth in addition to the berth holder. */
  extraPersonCount: integer("extra_person_count").notNull().default(0),
  /** Kept for reads of pre-count migrations; new writes use extraPersonCount. */
  extraPerson: boolean("extra_person").notNull().default(false),
  extraPersonChargePaise: bigint("extra_person_charge_paise", { mode: "number" }).notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.bookingId, t.seatId] }),
  check("booking_seat_extra_person_count_nonnegative", sql`${t.extraPersonCount} >= 0`),
]);

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => booking.id, { onDelete: "cascade" }),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  referenceNo: text("reference_no"),
  receivedByAgentId: uuid("received_by_agent_id").notNull().references(() => agent.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
}, (t) => [index("payment_booking_idx").on(t.bookingId)]);

/* ──────────────────── idempotency + audit ────────────────────────── */

export const idempotencyKey = pgTable("idempotency_key", {
  key: text("key").primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => agent.id),
  endpoint: text("endpoint").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: jsonb("response_json"),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ──────────────────────────── relations ──────────────────────────── */

export const busRelations = relations(bus, ({ many, one }) => ({
  layouts: many(seatLayout),
  currentLayout: one(seatLayout, {
    fields: [bus.currentLayoutId], references: [seatLayout.id],
  }),
}));

export const seatLayoutRelations = relations(seatLayout, ({ one, many }) => ({
  bus: one(bus, { fields: [seatLayout.busId], references: [bus.id] }),
  seats: many(seat),
}));

export const seatRelations = relations(seat, ({ one }) => ({
  layout: one(seatLayout, { fields: [seat.layoutId], references: [seatLayout.id] }),
}));

export const tripRelations = relations(trip, ({ one, many }) => ({
  route: one(route, { fields: [trip.routeId], references: [route.id] }),
  bus: one(bus, { fields: [trip.busId], references: [bus.id] }),
  layout: one(seatLayout, { fields: [trip.layoutId], references: [seatLayout.id] }),
  seatStates: many(tripSeatState),
  bookings: many(booking),
}));

export const tripSeatStateRelations = relations(tripSeatState, ({ one }) => ({
  trip: one(trip, { fields: [tripSeatState.tripId], references: [trip.id] }),
  seat: one(seat, { fields: [tripSeatState.seatId], references: [seat.id] }),
}));

export const bookingRelations = relations(booking, ({ one, many }) => ({
  trip: one(trip, { fields: [booking.tripId], references: [trip.id] }),
  createdByAgent: one(agent, {
    fields: [booking.createdByAgentId], references: [agent.id],
  }),
  seats: many(bookingSeat),
  payments: many(payment),
}));

export const bookingSeatRelations = relations(bookingSeat, ({ one }) => ({
  booking: one(booking, { fields: [bookingSeat.bookingId], references: [booking.id] }),
  seat: one(seat, { fields: [bookingSeat.seatId], references: [seat.id] }),
}));
