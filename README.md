# Bus Booking — Counter

Internal seat reservation and ticketing for a bus operator's travel office.
Staff ("agents") book on behalf of walk-in and phone customers. There is no
public-facing booking portal.

Requirements and rationale live in [`docs/SRS.md`](docs/SRS.md).
Stack decisions and the phased build plan live in [`docs/PLAN.md`](docs/PLAN.md).

## What works today

- **Sign in** — email + password, httpOnly JWT session, 12-hour expiry.
- **Bus management** — add and edit buses, each carrying its own seat layout.
- **Seat layout engine** — generate the standard 38 sleeper + 5 cabin bus in one
  click, then take full manual control: add, remove, renumber, retype or disable
  any berth. Double sofas add, move and delete as a pair.
- **Layout versioning** — once a trip uses a layout it freezes; saving edits
  creates a new version, so tickets already printed keep matching the seats they
  were sold against.
- **Audit log** — append-only, records every state change with actor, timestamp,
  IP and a before/after diff.

- **Trips** — routes with pickup and drop points, daily schedules, an idempotent
  generator, and ad-hoc extra buses.
- **Booking** — seat map with live updates, manual seat-number entry, per-seat
  prices defaulted from the bus and editable, and cash / online / pay-later.
- **Parked reservations** — hold seats, serve other customers, confirm later.
- **Tickets** — single or a whole trip at once, in three paper formats.

Reports and the driver's passenger chart are the remaining phases — see the
status table in `docs/PLAN.md`.

## Printing tickets

| Where | What it prints |
|---|---|
| `/tickets/<bookingId>` | One ticket. Linked from every row in Bookings and from the booking confirmation. |
| `/trips/<tripId>/tickets` | Every live ticket on a trip, ordered by seat so the stack matches the passenger chart. Linked from the trip card. |

Four formats, switchable on the page before printing:

| Format | Per A4 sheet | Use |
|---|---|---|
| **A4 · 8 per page** | 8 | Default. Two columns, four rows of 64mm. |
| **A4 · 4 per page** | 4 | Full-width strips, larger type, easier to tear. |
| **A5 · 1 per page** | 1 | Full detail including the per-berth breakdown. |
| **Thermal 80mm** | 1 | Counter receipt printer. |

Every ticket carries the operator name and phone, ticket number, route, date and
departure, bus and registration, passenger and mobile, pickup and drop, the seat
numbers, the total, the payment method, who booked it and when — and, when money
is still owed, **"₹1,200 TO COLLECT"** in red so the conductor cannot miss it.

The dense A4 formats drop the postal address, the per-berth fare table and the
terms: a passenger at the boarding point does not need them, and they are what
stands between four tickets a sheet and eight. Cancelled bookings print with a
CANCELLED watermark.

Sizing is driven by CSS keyed off the sheet's format rather than a React prop,
because the format toggle is client state while the ticket is rendered on the
server — switching from 8-up to A5 has to restyle without a re-render.

Set the operator header in the environment — `OFFICE_NAME`, `OFFICE_PHONE`,
`OFFICE_ADDRESS`, `OFFICE_GSTIN` and `OFFICE_TERMS`. They default to obvious
placeholders so an unconfigured deployment is caught at the first print rather
than by a customer.

## The seat layout

The bus this was built for:

```
CABIN        C1  C2  C3  C4  C5                    5 seats

LOWER deck   row 1   L1   ·  L2A L3B               single + double
             ...
             row 5   L13  ·  L14A L15B
             row 6   L16A L17B  L18A L19B          two doubles, no aisle

UPPER deck   same shape, U1 … U19
```

| | Units | Berths |
|---|---|---|
| Double sleeper sofas | 14 (7 per deck) | 28 |
| Single sleeper sofas | 10 (5 per deck) | 10 |
| Cabin seats | 5 | 5 |
| **Total** | | **43** |

None of this is hard-coded into the booking logic. The generator only seeds a
starting point; every berth's number, type, deck and grid position stays
editable, and other buses can have entirely different layouts.

## Setup

### 1. A database

**Local Postgres** (fastest for development):

```bash
createdb bus_booking_dev
```

**Or Neon** (what production uses) — create a project at
[neon.tech](https://neon.tech) and copy the **pooled** connection string.

The DB client detects which one you gave it and picks the right driver. Both
support the interactive transactions the seat-hold logic depends on.

### 2. Environment

```bash
cp .env.example .env.local
```

Then set `DATABASE_URL`, and generate a session secret:

```bash
openssl rand -base64 32
```

### 3. Migrate and seed

```bash
pnpm install
pnpm db:migrate      # or: pnpm db:push  for a quick local sync
pnpm db:seed         # first agent + a sample route and bus
```

The seed prints the login it created — `admin@office.local` / `changeme123`
by default. Override with `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME`.
**Change the password before this goes anywhere real.**

### 4. Run

```bash
pnpm dev
```

Then open http://localhost:3000 and sign in.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push the schema straight to the DB (development only) |
| `pnpm db:studio` | Drizzle Studio — browse the data |
| `pnpm db:seed` | Seed the first agent, a route and a bus |

## A note on the database driver

`src/db/index.ts` uses Neon's **WebSocket `Pool`**, deliberately not the HTTP
`neon()` driver. The seat hold and booking-confirm paths depend on
`BEGIN … SELECT FOR UPDATE … UPDATE … COMMIT` running in a single session. The
HTTP driver cannot do interactive transactions, so switching to it would
silently break the guarantee that a berth is never sold twice.

Concurrency design in full: [`docs/SRS.md` §5](docs/SRS.md).

## Deploying

Push to GitHub, import the repo on Vercel, and set `DATABASE_URL`,
`SESSION_SECRET`, `OFFICE_TIMEZONE` and `CRON_SECRET` as environment variables.
Both Vercel and Neon have free tiers with far more headroom than a single office
needs.
