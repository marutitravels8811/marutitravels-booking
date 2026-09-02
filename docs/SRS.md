# Software Requirements Specification (SRS)
## Bus Ticket Booking System — Travel Office / Counter Agent Edition

**Version:** 1.0
**Date:** 2026-09-02
**Author:** Divy Dedakiya
**Status:** Draft for implementation

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for an internal, web-based bus ticket
booking system used by staff of a bus operator / travel office. It is **not** a
public-facing consumer booking portal. All bookings are created by office
members ("agents") on behalf of walk-in or phone customers.

### 1.2 Scope
The system manages:
- A fleet of sleeper-cum-cabin buses running a fixed route, out and back, daily.
- Per-date, per-bus, per-direction seat inventory ("trips").
- An **assignable seat map** — seat numbers, berth types and deck positions are
  configured per bus, not hard-coded.
- A two-phase booking flow: **HOLD (reserve) → CONFIRM (after payment)**.
- Safe concurrent operation when several agents book at the same moment.
- Full audit: who did what, when.

### 1.3 Out of scope (v1)
- Customer self-service booking / mobile app.
- Online payment gateway integration (payment is recorded, not processed).
- GPS tracking, driver app, fuel/maintenance management.
- Multi-operator marketplace, commission settlement.

### 1.4 Definitions

| Term | Meaning |
|---|---|
| **Agent** | An office staff member who operates the system. The only user role. |
| **Bus** | A physical vehicle with a defined seat layout. |
| **Route** | An ordered origin → destination pair (e.g. Rajkot → Mumbai). |
| **Direction** | `ONWARD` or `RETURN` on the same route. |
| **Trip** | One bus, one route, one direction, one departure date. The unit that owns seat inventory. |
| **Berth / Seat** | A single sellable unit (one sleeper berth or one cabin seat). |
| **Sofa** | A sleeper unit; a *double sofa* contains 2 berths, a *single sofa* 1 berth. |
| **Hold** | A time-limited soft reservation on one or more berths. |
| **Booking** | A confirmed sale, created from a hold after payment is recorded. |

---

## 2. Overall Description

### 2.1 Product perspective
A single-tenant web application. One office, one operator, one user role
(`AGENT`). Every agent can do everything: manage buses, generate trips, hold
seats, confirm bookings, cancel, and view reports. Accountability comes from the
audit trail, not from permission tiers.

### 2.2 User characteristics
Counter staff, moderate computer literacy, working under time pressure with a
customer standing in front of them. Implications:
- Seat map must be the primary interface — click seats, not type seat numbers.
- Keyboard-friendly; minimum clicks from "customer walks in" to "ticket printed".
- Must work on a desktop browser (1366×768 minimum) and be usable on a tablet.

### 2.3 Operating environment
- Modern browser (Chrome/Edge, last 2 versions).
- Internet connection required (cloud-hosted, no offline mode in v1).
- Single office location; 2–6 concurrent agents expected.

### 2.4 Constraints
- Hosting must be **free tier** and **fast to deploy**.
- Seat inventory must never be double-sold, even under concurrent access.
- All money amounts in INR, stored as integers (paise) to avoid float errors.
- All timestamps stored in UTC (`timestamptz`), displayed in `Asia/Kolkata`.

---

## 3. Seat Layout Model

### 3.1 The physical layout
Per the operator's bus configuration:

| Category | Units | Berths |
|---|---|---|
| Double sleeper sofa | 14 | 28 |
| Single sleeper sofa | 10 | 10 |
| **Sleeper subtotal** | **24** | **38** |
| Cabin seat | 5 | 5 |
| **Total sellable berths** | | **43** |

Sleeper units are distributed across **UPPER** and **LOWER** decks. Cabin seats
occupy their own zone (`CABIN`).

### 3.2 Design decision: layout is data, not code
The requirement "the numbering should be assignable" means the seat map is a
**configurable template**, not a constant. The system stores, per bus:

- A `seat_layout` record (versioned) describing decks and grid dimensions.
- One `seat` row per berth, each carrying:
  - `seat_number` — the label printed on the ticket (`"U1"`, `"L7A"`, `"C3"` — free text, unique per layout)
  - `deck` — `UPPER` | `LOWER` | `CABIN`
  - `berth_type` — `SLEEPER_SINGLE` | `SLEEPER_DOUBLE` | `CABIN`
  - `sofa_group_id` — nullable; the two berths of one double sofa share a group id
  - `sofa_position` — `A` | `B` | `null` (which half of the double)
  - `row_index`, `col_index` — grid coordinates for rendering
  - `is_active` — allows retiring a berth without deleting history

A **Layout Editor** screen lets an agent place berths on a grid, set the type,
and type the number. A "Generate default 38+5 layout" button seeds the standard
configuration so the common case takes one click.

### 3.3 Layout versioning
A layout that has ever been used by a trip becomes **frozen**. Editing it
creates `version + 1`; existing trips keep pointing at the old version so
historical tickets remain accurate.

### 3.4 Double-sofa selling rules
Configurable per layout via `double_sofa_policy`:
- `INDEPENDENT` (default) — each berth of a double sofa sells separately.
- `PAIRED` — a double sofa must be sold as a pair (both berths together).
- `SOFT_PAIR` — sells separately, but the UI warns when splitting a double
  between two unrelated customers, and can enforce a gender/ family note.

---

## 4. Functional Requirements

### 4.1 Authentication & agents

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | An agent signs in with email + password. | Must |
| FR-1.2 | Sessions are httpOnly cookie based, 12-hour expiry, sliding renewal. | Must |
| FR-1.3 | Every agent has: name, email, phone, active flag. Single role `AGENT`. | Must |
| FR-1.4 | An agent can be deactivated; deactivation blocks login but preserves all historical references. | Must |
| FR-1.5 | The first account is seeded at deploy time; subsequent agents are created from within the app by any signed-in agent. | Must |
| FR-1.6 | Passwords hashed with bcrypt/argon2; never logged or returned by any API. | Must |

### 4.2 Master data

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | CRUD for **routes**: code, origin, destination, distance, default duration, active flag. | Must |
| FR-2.2 | CRUD for **buses**: registration number, display name, operator note, seat layout, active flag. | Must |
| FR-2.3 | CRUD for **seat layouts** with the grid editor described in §3.2. | Must |
| FR-2.4 | A "generate standard layout" action creates 14 doubles + 10 singles across upper/lower + 5 cabin, with editable auto-numbering. | Must |
| FR-2.5 | CRUD for **fare rules**: per route, per direction, per berth type → base price. Trip-level override allowed. | Must |
| FR-2.6 | CRUD for **boarding / dropping points** per route, with sequence and offset minutes. | Should |

### 4.3 Trip / schedule management

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | A **schedule template** defines: route, direction, bus, departure time, arrival time, days of week, valid-from/valid-to. | Must |
| FR-3.2 | A **trip generator** materialises trips from templates for a chosen date range (e.g. next 60 days). Idempotent — re-running never duplicates. | Must |
| FR-3.3 | Because demand varies, an agent can add an **ad-hoc trip** for a specific date (2nd or 3rd bus) without a template. | Must |
| FR-3.4 | Trip statuses: `SCHEDULED`, `DEPARTED`, `CANCELLED`, `COMPLETED`. | Must |
| FR-3.5 | Cancelling a trip flags all its confirmed bookings for refund and releases all holds. | Must |
| FR-3.6 | On trip creation, the system snapshots the bus's seat layout version into the trip. | Must |
| FR-3.7 | A nightly job marks past trips `COMPLETED` and expires stale holds. | Should |

### 4.4 Seat map & availability

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Selecting date + route + direction lists all trips for that day with `available / total` counts. | Must |
| FR-4.2 | Opening a trip renders the seat map with per-berth state: `AVAILABLE`, `HELD_BY_ME`, `HELD_BY_OTHER`, `BOOKED`, `BLOCKED`. | Must |
| FR-4.3 | `HELD_BY_OTHER` seats show the holding agent's name and hold expiry, and cannot be selected. | Must |
| FR-4.4 | The seat map polls (or subscribes to) live updates so a seat taken by another agent greys out within ≤3 seconds. | Must |
| FR-4.5 | An agent can **block** a seat (driver/staff/maintenance) with a reason; blocked seats are unsellable until unblocked. | Should |
| FR-4.6 | The map visually distinguishes upper deck, lower deck, cabin, single vs double sofa, and shows the double-sofa pairing. | Must |

### 4.5 Hold (reserve) — phase 1

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | An agent selects 1..N available seats on a trip and creates a **hold**. | Must |
| FR-5.2 | A hold has a TTL, default **10 minutes**, configurable per deployment. | Must |
| FR-5.3 | A hold is atomic and all-or-nothing: if any selected seat is unavailable, the entire hold fails with the list of conflicting seats. | Must |
| FR-5.4 | The holding agent sees a live countdown and can **extend once** by the TTL (max 2 extensions). | Should |
| FR-5.5 | An agent can release their own hold explicitly. Any agent can force-release another's hold, and the action is audited with a mandatory reason. | Must |
| FR-5.6 | Expired holds are treated as released; a background sweeper deletes them. Expiry is enforced by comparison at read/write time, never solely by the sweeper. | Must |
| FR-5.7 | A hold optionally carries provisional passenger details so an interrupted flow can resume. | Should |

### 4.6 Booking (confirm) — phase 2

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | An agent converts a live hold into a **booking** by supplying: primary passenger name, mobile number, per-seat passenger name/age/gender, amount, payment type, optional boarding/dropping point, optional note. | Must |
| FR-6.2 | Payment types: `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `WALLET`, `CREDIT` (pay later), `PARTIAL`. | Must |
| FR-6.3 | For `PARTIAL` / `CREDIT`, the system records `amount_total`, `amount_paid`, `amount_due`, and marks the booking `PARTIALLY_PAID`. Payments can be added later against the booking. | Must |
| FR-6.4 | Confirmation is rejected if the hold has expired, was released, or is not the caller's — the seats are released back and the agent is told to re-select. | Must |
| FR-6.5 | Every booking receives a human-readable unique PNR (e.g. `RJ-260902-0413`). | Must |
| FR-6.6 | Booking stores immutably: `created_by_agent_id`, `created_at`, and on every change `updated_by_agent_id`, `updated_at`. | Must |
| FR-6.7 | Booking statuses: `CONFIRMED`, `PARTIALLY_PAID`, `CANCELLED`, `NO_SHOW`, `COMPLETED`. | Must |
| FR-6.8 | The system prints/downloads a ticket (A5 / thermal 80mm) containing PNR, passenger, seats, trip, boarding point, amount, payment type, agent name, timestamp. | Must |
| FR-6.9 | Optional SMS/WhatsApp confirmation to the passenger's mobile (pluggable provider, disabled by default). | Could |

### 4.7 Modify & cancel

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | An agent can cancel a booking, with reason. Seats return to `AVAILABLE` atomically. | Must |
| FR-7.2 | A cancellation records refund amount computed from a configurable cancellation policy (e.g. >24h → 90%, 12–24h → 50%, <12h → 0%), which the agent may override with a reason. | Should |
| FR-7.3 | An agent can **change seats** within the same trip: this is an atomic swap — new seats must be free, old seats released, in one transaction. | Should |
| FR-7.4 | An agent can **transfer** a booking to another trip on the same or another date, subject to the same atomicity. | Could |
| FR-7.5 | Passenger name/phone corrections are allowed and versioned in the audit log. | Must |

### 4.8 Search, reports, day-close

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Search bookings by PNR, mobile, passenger name, date range, trip, agent, payment type, status. | Must |
| FR-8.2 | **Passenger chart** per trip: seat-ordered manifest, printable, for the driver/conductor. | Must |
| FR-8.3 | **Daily collection report**: per agent, per payment type, totals, refunds, net. Exportable to CSV/XLSX. | Must |
| FR-8.4 | **Occupancy report**: per trip/route/date, seats sold vs capacity, revenue. | Should |
| FR-8.5 | **Audit log viewer**: filter by entity, agent, action, date range. | Must |
| FR-8.6 | **Day close**: an agent closes the day; the system snapshots totals and flags later back-dated edits. | Could |

### 4.9 Audit trail

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | Every state-changing operation writes an `audit_log` row: actor agent, action, entity type, entity id, before/after JSON diff, IP, user agent, timestamp. | Must |
| FR-9.2 | Audit rows are append-only — no update or delete path exists in the application. | Must |
| FR-9.3 | Hold create / release / expire / force-release are audited alongside bookings. | Must |

---

## 5. Concurrency Requirements (the critical section)

### 5.1 The problem
Two agents view the same trip. Both see berth `U7` free. Both click it within the
same second. Exactly one must win; the other must receive a clear, immediate
"seat just taken" message — and no partial state may survive.

### 5.2 Guarantees the system must provide

| ID | Guarantee |
|---|---|
| CR-1 | **No double-sell.** A berth on a trip has at most one live hold OR one active booking at any instant. Enforced at the database level, not only in application code. |
| CR-2 | **All-or-nothing multi-seat holds.** Holding 4 seats either takes all 4 or takes none. |
| CR-3 | **No lost seats.** A crashed or abandoned flow must never leave a seat permanently unsellable — every hold expires. |
| CR-4 | **Deterministic ordering.** Concurrent multi-seat requests must not deadlock. Seat ids are locked in a fixed sort order in every transaction. |
| CR-5 | **Read-your-writes.** After a successful hold, the agent's own next read shows those seats as held by them. |
| CR-6 | **Fast failure.** A conflict is reported in a single round trip with the exact conflicting seat numbers — never a generic error. |

### 5.3 Mechanism

The design uses **PostgreSQL as the single source of truth for seat state**, and
leans on three layers:

**Layer 1 — Database uniqueness (the real guarantee).**
A `trip_seat_state` table holds one row per (trip, seat). Its state column and a
partial unique index make double-occupancy structurally impossible:

```sql
-- one row per seat per trip; created when the trip is generated
CREATE TABLE trip_seat_state (
  trip_id       uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  seat_id       uuid NOT NULL REFERENCES seat(id),
  status        seat_status NOT NULL DEFAULT 'AVAILABLE',  -- AVAILABLE|HELD|BOOKED|BLOCKED
  hold_id       uuid NULL REFERENCES seat_hold(id) ON DELETE SET NULL,
  booking_id    uuid NULL REFERENCES booking(id),
  held_until    timestamptz NULL,
  version       integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, seat_id),
  CONSTRAINT held_needs_hold   CHECK (status <> 'HELD'   OR (hold_id IS NOT NULL AND held_until IS NOT NULL)),
  CONSTRAINT booked_needs_bkg  CHECK (status <> 'BOOKED' OR booking_id IS NOT NULL)
);
```

The composite primary key `(trip_id, seat_id)` **is** the mutual-exclusion
mechanism: there is physically one row to fight over per berth.

**Layer 2 — Atomic conditional update inside one transaction.**
A hold is created with a single guarded `UPDATE ... WHERE` that only touches rows
that are genuinely free, then asserts the row count:

```sql
BEGIN;                              -- READ COMMITTED is sufficient
INSERT INTO seat_hold(id, trip_id, agent_id, expires_at, status)
VALUES ($hold_id, $trip, $agent, now() + interval '10 minutes', 'ACTIVE');

WITH target AS (
  SELECT trip_id, seat_id
  FROM trip_seat_state
  WHERE trip_id = $trip AND seat_id = ANY($seat_ids)
  ORDER BY seat_id                  -- CR-4: fixed lock order, no deadlock
  FOR UPDATE                        -- row locks; concurrent txn blocks here
)
UPDATE trip_seat_state s
SET status = 'HELD', hold_id = $hold_id,
    held_until = now() + interval '10 minutes',
    version = s.version + 1, updated_at = now()
FROM target t
WHERE s.trip_id = t.trip_id AND s.seat_id = t.seat_id
  AND ( s.status = 'AVAILABLE'
     OR (s.status = 'HELD' AND s.held_until < now()) )   -- FR-5.6: lazy expiry
RETURNING s.seat_id;
-- application asserts: rows_returned = length(seat_ids), else ROLLBACK
COMMIT;
```

If the count does not match, the transaction rolls back — CR-2 satisfied — and
the API responds `409 SEAT_CONFLICT` with the seat numbers that failed.

**Layer 3 — Confirm is the same pattern, guarded by hold ownership.**

```sql
BEGIN;
SELECT * FROM seat_hold
 WHERE id = $hold_id AND agent_id = $agent
   AND status = 'ACTIVE' AND expires_at > now()
 FOR UPDATE;                        -- no row => 409 HOLD_EXPIRED

INSERT INTO booking (...) VALUES (...) RETURNING id;

UPDATE trip_seat_state
   SET status='BOOKED', booking_id=$booking, hold_id=NULL,
       held_until=NULL, version=version+1
 WHERE trip_id=$trip AND hold_id=$hold_id AND status='HELD';
-- assert affected = seat count

UPDATE seat_hold SET status='CONSUMED' WHERE id=$hold_id;
INSERT INTO audit_log (...);
COMMIT;
```

Because booking creation, seat flip, hold consumption and the audit row are in
**one transaction**, there is no window where money is recorded but seats are
not, or vice versa.

**Layer 4 — Expiry, belt and braces.**
- *Lazy*: every read and every hold attempt treats `held_until < now()` as free.
- *Eager*: a scheduled job every minute marks expired holds `EXPIRED` and resets their
  seats to `AVAILABLE`. Correctness never depends on this job running — it only
  keeps the UI tidy.

**Layer 5 — Idempotency.**
Every mutating API accepts an `Idempotency-Key` header stored in an
`idempotency_key` table with a unique index. A retried request (double-click,
flaky network) returns the original response instead of creating a second hold
or a duplicate booking.

**Layer 6 — Optimistic UI safety.**
The client sends the `version` it last saw for each seat. A stale version fails
fast with a "your seat map is out of date, refreshing" message instead of a
confusing conflict.

### 5.4 Live seat map updates
Clients viewing a trip poll a lightweight
`GET /api/trips/:id/seats?since=<version>` delta endpoint every 3 seconds. The
response carries only seats whose `version` advanced, so the request stays small
even on a full bus. Push (Postgres `LISTEN/NOTIFY`) can be layered on later as a
latency optimisation; it is a **convenience only** and is never trusted for
correctness.

### 5.5 Concurrency test plan (acceptance)
| Test | Expectation |
|---|---|
| CT-1 | 50 parallel hold requests for the same single seat → exactly 1 success, 49 × `409`. |
| CT-2 | 2 agents hold overlapping 4-seat sets simultaneously → exactly one succeeds fully; the other gets 409 naming the overlap; no seat left `HELD` by a rolled-back txn. |
| CT-3 | Hold, kill the client process, wait TTL + 1 min → seat becomes `AVAILABLE`. |
| CT-4 | Confirm against an expired hold → `409 HOLD_EXPIRED`, no booking row, no seat change. |
| CT-5 | Same `Idempotency-Key` sent twice → one booking, identical response body both times. |
| CT-6 | Cancel + rehold in a tight loop, 1000 iterations → seat count invariant holds; no orphan rows. |
| CT-7 | Deadlock probe: two txns request seat sets `{A,B}` and `{B,A}` → no deadlock (fixed ordering). |

---

## 6. Data Model

### 6.1 Entities

```
agent(id, name, email UNIQUE, phone, password_hash, is_active,
      created_at, updated_at)

route(id, code UNIQUE, origin, destination, distance_km,
      default_duration_min, is_active)

boarding_point(id, route_id, name, address, sequence,
               offset_minutes, kind[BOARDING|DROPPING])

bus(id, registration_no UNIQUE, display_name, note,
    current_layout_id, is_active)

seat_layout(id, bus_id, version, name, double_sofa_policy,
            upper_rows, upper_cols, lower_rows, lower_cols,
            is_frozen, created_by, created_at)
   UNIQUE(bus_id, version)

seat(id, layout_id, seat_number, deck[UPPER|LOWER|CABIN],
     berth_type[SLEEPER_SINGLE|SLEEPER_DOUBLE|CABIN],
     sofa_group_id, sofa_position[A|B], row_index, col_index,
     is_active)
   UNIQUE(layout_id, seat_number)
   UNIQUE(layout_id, deck, row_index, col_index)

fare_rule(id, route_id, direction, berth_type, price_paise,
          valid_from, valid_to)

schedule_template(id, route_id, direction[ONWARD|RETURN], bus_id,
                  departure_time, arrival_time, days_of_week smallint[],
                  valid_from, valid_to, is_active)

trip(id, route_id, direction, bus_id, layout_id, service_date,
     departure_at, arrival_at, status, template_id NULL,
     total_seats, created_by, created_at)
   UNIQUE(bus_id, service_date, direction)

trip_seat_state(trip_id, seat_id, status, hold_id, booking_id,
                held_until, version, updated_at)     -- see §5.3
   PK(trip_id, seat_id)

trip_fare_override(trip_id, berth_type, price_paise)

seat_hold(id, trip_id, agent_id, status[ACTIVE|CONSUMED|RELEASED|EXPIRED],
          expires_at, extension_count, provisional_name, provisional_phone,
          created_at, released_at, released_by, release_reason)

booking(id, pnr UNIQUE, trip_id, primary_passenger_name,
        primary_phone, alt_phone, email,
        amount_total_paise, amount_paid_paise, amount_due_paise,
        payment_type, status, boarding_point_id, dropping_point_id,
        note, hold_id, source_booking_id,
        created_by_agent_id, created_at,
        updated_by_agent_id, updated_at,
        cancelled_at, cancelled_by, cancel_reason, refund_paise)

booking_seat(booking_id, seat_id, passenger_name, age, gender,
             fare_paise)
   PK(booking_id, seat_id)

payment(id, booking_id, amount_paise, payment_type, reference_no,
        received_by_agent_id, received_at, note)

idempotency_key(key PRIMARY KEY, agent_id, endpoint, request_hash,
                response_json, status_code, created_at)

audit_log(id, agent_id, action, entity_type, entity_id,
          before_json, after_json, ip, user_agent, created_at)
```

### 6.2 Key indexes
```sql
CREATE INDEX ON trip (service_date, route_id, direction, status);
CREATE INDEX ON trip_seat_state (trip_id, status);
CREATE INDEX ON trip_seat_state (held_until) WHERE status = 'HELD';
CREATE INDEX ON booking (trip_id);
CREATE INDEX ON booking (primary_phone);
CREATE INDEX ON booking (created_at DESC);
CREATE INDEX ON booking (created_by_agent_id, created_at DESC);
CREATE INDEX ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX ON seat_hold (expires_at) WHERE status = 'ACTIVE';
```

---

## 7. API Specification

All endpoints are server actions / route handlers under `/api`. All mutating
calls accept `Idempotency-Key`. All responses use a consistent error envelope
`{ error: { code, message, details } }`.

### Auth
```
POST   /api/auth/login              { email, password } → session cookie
POST   /api/auth/logout
GET    /api/auth/me
```

### Masters
```
GET|POST        /api/routes            PATCH /api/routes/:id
GET|POST        /api/buses             PATCH /api/buses/:id
GET|POST        /api/layouts           GET   /api/layouts/:id
POST            /api/layouts/generate-standard   { busId }
POST            /api/layouts/:id/clone           → new editable version
GET|POST        /api/fares
GET|POST        /api/agents            PATCH /api/agents/:id
```

### Schedules & trips
```
GET|POST  /api/schedule-templates
POST      /api/trips/generate      { fromDate, toDate, templateIds? }
GET       /api/trips?date=&routeId=&direction=
POST      /api/trips               (ad-hoc extra bus)
PATCH     /api/trips/:id           (status, times, fare override)
GET       /api/trips/:id/seats     → seat map + states + versions
GET       /api/trips/:id/seats?since=<v>   → delta
GET       /api/trips/:id/chart     → passenger manifest
```

### Booking flow
```
POST   /api/holds                  { tripId, seatIds[], provisional? }
         → 201 { holdId, expiresAt, seats[] }
         → 409 { code: SEAT_CONFLICT, details: { conflictingSeats[] } }
POST   /api/holds/:id/extend       → 200 { expiresAt } | 409 HOLD_EXPIRED
DELETE /api/holds/:id              { reason? }        (release)
GET    /api/holds/mine

POST   /api/bookings               { holdId, passenger, seats[], amount,
                                     paymentType, boardingPointId?, note? }
         → 201 { bookingId, pnr, ... }
         → 409 { code: HOLD_EXPIRED | SEAT_CONFLICT }
GET    /api/bookings?q=&from=&to=&tripId=&agentId=&status=
GET    /api/bookings/:id
POST   /api/bookings/:id/payments  { amount, paymentType, referenceNo }
POST   /api/bookings/:id/cancel    { reason, refundOverride? }
POST   /api/bookings/:id/change-seats { newSeatIds[] }
GET    /api/bookings/:id/ticket    → printable HTML / PDF
```

### Reports
```
GET /api/reports/daily-collection?date=&agentId=
GET /api/reports/occupancy?from=&to=&routeId=
GET /api/audit?entityType=&entityId=&agentId=&from=&to=
```

### Error codes
`SEAT_CONFLICT`, `HOLD_EXPIRED`, `HOLD_NOT_YOURS`, `TRIP_CANCELLED`,
`TRIP_DEPARTED`, `LAYOUT_FROZEN`, `DUPLICATE_TRIP`, `VALIDATION_FAILED`,
`UNAUTHENTICATED`, `RATE_LIMITED`, `IDEMPOTENT_REPLAY`.

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Seat map first paint < 1.5 s on office broadband; seat state read < 200 ms p95. |
| NFR-2 | Hold and confirm APIs < 400 ms p95 under 10 concurrent agents. |
| NFR-3 | Seat state propagates to other agents' screens within 3 s. |
| NFR-4 | Availability target 99% during 07:00–23:00 IST. |
| NFR-5 | Daily automated database backup with 7-day retention (free tier) plus a weekly manual export to cloud storage. |
| NFR-6 | All traffic over HTTPS; cookies `Secure`, `HttpOnly`, `SameSite=Lax`. |
| NFR-7 | Rate limit: 30 hold attempts per agent per minute. |
| NFR-8 | Passenger PII (name, phone) is not exposed in any unauthenticated endpoint or in logs. |
| NFR-9 | The app must be fully usable with keyboard only for the hold → confirm path. |
| NFR-10 | All money as `bigint` paise. All timestamps `timestamptz` in UTC. |
| NFR-11 | The UI must remain correct across a device clock skew — countdowns are computed from server-supplied `expiresAt` and a server-time offset. |

---

## 9. Assumptions
1. One office / one operator (single tenant). Multi-branch is a future concern.
2. A bus runs at most one trip per direction per date (enforced by unique constraint); a second bus on the same route is a separate `trip` row with a different bus.
3. Payment is recorded manually; no gateway settlement reconciliation in v1.
4. Cancellation refunds are recorded in the system but paid out manually.
5. The "38 sleeper + 5 cabin" figure is the current standard bus; other buses may have different layouts, which the layout editor supports.
6. All agents are trusted staff — hence a single role. Misuse is deterred by the audit log.
