# Development Plan — Bus Ticket Booking System
**Companion to `docs/SRS.md` · Version 1.0 · 2026-09-02**

---

## 1. Tech Stack Decision

### 1.1 The stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | **Next.js 15 (App Router, TypeScript)** | One codebase for UI + API. Server Actions let a seat hold run as a single server round trip. Vercel deploys it in ~40 s. |
| **UI** | **React 19 + Tailwind CSS v4 + shadcn/ui** | shadcn gives production-quality dialogs/tables/forms as copy-in source — no runtime dependency, fully restylable. Tailwind makes the custom seat-map grid trivial. |
| **State/data** | **TanStack Query** | Cache invalidation, polling, optimistic updates and retry semantics for the seat map, for free. |
| **Database** | **PostgreSQL via Neon** | The concurrency design *requires* real transactions, `SELECT … FOR UPDATE`, partial unique indexes and `timestamptz`. Postgres is the only sensible choice. Neon free tier: 0.5 GB storage, autoscaling, instant branching (a throwaway branch per CI run is ideal for the concurrency suite). |
| **ORM** | **Drizzle ORM** | Typed SQL that stays close to SQL — critical because the hold/confirm queries are hand-written for correctness. Migrations are plain `.sql` files you can read and review. |
| **Auth** | **Auth.js v5 (NextAuth) credentials provider** + argon2 | Single role, email/password, httpOnly session cookie. No third-party dependency, no per-user pricing. |
| **Realtime** | **Polling a `?since=<version>` delta endpoint** (3 s) | Neon has no hosted realtime channel, so the seat map polls a cheap delta endpoint. This was always the fallback path in the SRS; correctness never depended on a push channel. |
| **Validation** | **Zod** | One schema shared by client form, server action and DB insert. |
| **Cron** | **Vercel Cron** → `/api/cron/expire-holds` | Neon does not offer `pg_cron`, so the sweep runs as an authenticated route hit on a schedule. Correctness does not depend on it: expiry is also evaluated lazily on every read and every hold attempt. |
| **PDF / print** | Browser print + a dedicated `@media print` stylesheet | Zero dependency, zero cost, works with thermal printers. |
| **Testing** | Vitest (unit) + Playwright (E2E) + a custom concurrency harness | See §5. |
| **CI** | GitHub Actions (free for public/small private) | Typecheck, lint, unit, migrations-dry-run, Playwright on PR. |
| **Error tracking** | Sentry free tier (5k events/mo) | Optional but recommended. |

### 1.2 Hosting — free, fast, and adequate

| Service | Free tier | Fits because |
|---|---|---|
| **Vercel Hobby** | 100 GB bandwidth/mo, serverless functions, automatic HTTPS, preview deploys per PR | 6 agents in one office generate a rounding error of traffic. |
| **Neon Free** | 0.5 GB storage, 190 compute-hours/mo, database branching | 43 seats × 3 buses × 2 directions × 365 days ≈ 94 k seat-state rows/year — roughly 20 MB. Years of headroom. |

**Deploy time from `git push` to live URL: under two minutes.**

> ⚠️ **One caveat, stated plainly.** Neon's free tier scales a branch to zero
> after ~5 minutes idle, so the first query after a quiet spell pays a cold
> start of roughly 500 ms. During counter hours the app is never idle that long,
> and the cron sweep keeps it warm regardless. Neon Launch is $19/mo if you ever
> want always-on — you will not need it for v1.

### 1.3 Rejected alternatives (and why)

| Option | Verdict |
|---|---|
| MongoDB / Firestore | ✗ No `SELECT … FOR UPDATE` over a set of rows. A multi-seat all-or-nothing hold becomes fragile application logic instead of a database guarantee. **Disqualified by the core requirement.** |
| MongoDB Atlas | ✗ Transactions exist but the relational seat/trip/booking model fights the document shape. |
| Supabase | ○ A fine alternative — it adds Realtime and `pg_cron`. Neon was chosen for branching (a fresh database per concurrency-test run) and faster cold starts. Swapping back means changing one connection string. |
| PlanetScale / MySQL | ✗ Free tier discontinued; weaker partial-index support. |
| Separate Express API + React SPA | ✗ Two deploys, two repos, CORS, no server actions. Slower to build with no benefit at this scale. |
| Redis for seat locking | ✗ An extra moving part that can drift from the database. Postgres row locks are already correct and fast enough. Add Redis only if you ever exceed ~500 holds/sec — you won't. |

---

## 2. Repository Layout

```
bus-booking/
├── docs/
│   ├── SRS.md
│   └── PLAN.md
├── drizzle/
│   ├── schema.ts                  # single source of truth for tables
│   ├── relations.ts
│   └── migrations/                # generated .sql, committed & reviewed
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/
│   │   │   ├── layout.tsx         # shell: sidebar, agent menu, server-time sync
│   │   │   ├── page.tsx           # today's dashboard
│   │   │   ├── book/              # date → trip → seat map → hold → confirm
│   │   │   ├── bookings/          # search, detail, cancel, change seats
│   │   │   ├── trips/             # generate, ad-hoc, chart, cancel
│   │   │   ├── masters/
│   │   │   │   ├── routes/ buses/ fares/ agents/
│   │   │   │   └── layouts/[id]/  # seat layout editor
│   │   │   └── reports/           # collection, occupancy, audit
│   │   └── api/
│   │       ├── holds/ bookings/ trips/ reports/
│   │       └── cron/expire-holds/
│   ├── server/
│   │   ├── db.ts                  # drizzle client, pooled
│   │   ├── auth.ts
│   │   ├── audit.ts               # writeAudit(tx, {...})
│   │   ├── idempotency.ts
│   │   └── services/
│   │       ├── seat-hold.ts       # ⭐ the transaction in SRS §5.3
│   │       ├── booking.ts         # ⭐ confirm / cancel / change-seats
│   │       ├── trip.ts            # generator, ad-hoc, chart
│   │       ├── layout.ts          # standard-layout generator, versioning
│   │       └── reports.ts
│   ├── components/
│   │   ├── seat-map/
│   │   │   ├── SeatMap.tsx        # deck tabs, grid, legend
│   │   │   ├── Seat.tsx           # one berth: state colour, tooltip
│   │   │   ├── SofaGroup.tsx      # double-sofa pairing visual
│   │   │   └── HoldTimer.tsx      # server-offset countdown
│   │   ├── layout-editor/
│   │   └── ui/                    # shadcn
│   ├── lib/
│   │   ├── schemas.ts             # zod
│   │   ├── money.ts               # paise helpers, never floats
│   │   ├── pnr.ts
│   │   └── time.ts                # UTC store / IST display, server offset
│   └── types/
├── tests/
│   ├── unit/
│   ├── e2e/                       # playwright
│   └── concurrency/               # ⭐ the CT-1..CT-7 harness
└── scripts/
    ├── seed.ts                    # first agent, sample route/bus/layout
    └── load-test.ts
```

---

## 3. Build Order — 8 Phases

The phases are ordered so that **the hardest and riskiest thing (concurrency) is
proven in week 2**, not discovered in week 8.

### Phase 0 — Foundation (Days 1–2)
- [ ] `create-next-app` with TypeScript, Tailwind, App Router; init git.
- [ ] Neon project; pooled connection string in `.env.local`.
- [ ] Drizzle configured; `pnpm db:generate` / `db:migrate` scripts working.
- [ ] shadcn/ui init; base theme; app shell with sidebar.
- [ ] Deploy the empty shell to Vercel — **prove the pipeline on day 1**.
- [ ] GitHub Actions: typecheck + lint on PR.

**Exit:** a blank authenticated-looking app is live on a real URL.

### Phase 1 — Schema & auth (Days 3–5)
- [ ] Write the full Drizzle schema from SRS §6.1 — all tables, enums, checks.
- [ ] All indexes from SRS §6.2.
- [ ] Migration applied to Neon.
- [ ] `scripts/seed.ts`: one agent, one route, one bus, standard layout.
- [ ] Auth.js credentials provider, argon2 hashing, protected route group.
- [ ] `writeAudit()` helper that takes the *transaction* (never a fresh connection).

**Exit:** log in, land on an empty dashboard, `audit_log` records the login.

### Phase 2 — Seat layout engine (Days 6–9) ⭐ *first real feature*
- [ ] `generateStandardLayout(busId)`: 14 doubles + 10 singles across UPPER/LOWER + 5 CABIN, auto-numbered `U1…`, `L1…`, `C1…`.
- [ ] `SeatMap` renderer: deck tabs, CSS grid, single vs double sofa visuals, cabin zone, legend.
- [ ] Layout editor: click a grid cell → choose berth type → type the seat number; drag to move; pair two cells into a double sofa.
- [ ] Validation: unique numbers within a layout, no two berths in one cell, double sofas must have exactly 2 members.
- [ ] Layout versioning + freeze-on-use + clone-to-edit.

**Exit:** you can create a bus, click "generate standard", renumber every berth by hand, and see the map render exactly like the physical bus.

### Phase 3 — Trips & availability (Days 10–13)
- [ ] Route / bus / fare CRUD screens.
- [ ] Schedule templates + idempotent trip generator over a date range.
- [ ] Ad-hoc extra-bus creation (the "2nd or 3rd bus today" case).
- [ ] On trip creation: snapshot layout version + bulk-insert `trip_seat_state` rows in the same transaction.
- [ ] Trip list by date/route/direction with live `available / total`.
- [ ] Seat map bound to real `trip_seat_state`.

**Exit:** pick a date, see today's buses both directions, open one, see 43 berths all `AVAILABLE`.

### Phase 4 — Hold & confirm ⭐⭐ THE CORE (Days 14–19)
This is the phase that decides whether the product is trustworthy.

- [ ] `createHold(tripId, seatIds, agentId)` — the exact transaction in SRS §5.3, including `ORDER BY seat_id … FOR UPDATE` and the row-count assertion.
- [ ] Lazy expiry in every availability read.
- [ ] Vercel Cron hitting `/api/cron/expire-holds` every minute: expire stale holds, free their seats.
- [ ] Hold UI: select berths → "Reserve" → countdown timer driven by server-supplied `expiresAt` + measured clock offset → extend / release.
- [ ] `confirmBooking(holdId, …)` — booking + `booking_seat` rows + seat flip + hold consume + audit, all in one transaction. PNR generation.
- [ ] Idempotency middleware on `POST /api/holds` and `POST /api/bookings`.
- [ ] Conflict UX: 409 highlights the exact stolen berths in red and auto-refreshes the map.
- [ ] 3 s polling of the `?since=<version>` seat delta endpoint.
- [ ] **Write and pass the CT-1 … CT-7 concurrency tests before moving on.**

**Exit:** two browsers, same trip, same seat, simultaneous clicks → one ticket, one clean error. The automated 50-way race test passes 100 consecutive runs.

### Phase 5 — Booking lifecycle & tickets (Days 20–24)
- [ ] Booking search: PNR / phone / name / date / trip / agent / status.
- [ ] Booking detail: passengers, seats, payments, full audit timeline.
- [ ] Partial payment + add-payment flow; `amount_due` derived, never hand-set.
- [ ] Cancel with policy-computed refund + override-with-reason.
- [ ] Change seats within a trip — atomic swap in one transaction.
- [ ] Printable ticket (A5 + 80 mm thermal) and passenger chart, both `@media print`.

**Exit:** the full counter workflow works end to end, including the messy cases.

### Phase 6 — Reports & audit (Days 25–27)
- [ ] Daily collection: per agent × per payment type, refunds, net. CSV export.
- [ ] Occupancy: per trip/route/date, sold vs capacity, revenue.
- [ ] Audit log viewer with filters and before/after diff rendering.
- [ ] Dashboard: today's trips, live occupancy bars, today's collection, active holds.

**Exit:** the owner can answer "how much did we take today, and who booked what" without opening the database.

### Phase 7 — Hardening & go-live (Days 28–32)
- [ ] Rate limiting on hold/login.
- [ ] Global error boundary + Sentry.
- [ ] Playwright E2E covering: login → book → print, and cancel → rebook.
- [ ] Backup verification: restore a snapshot into a scratch database and diff.
- [ ] Accessibility pass on the seat map (keyboard selection, focus ring, ARIA labels per berth).
- [ ] Real-data migration: load the actual route, actual buses, actual seat numbers.
- [ ] Two days of **parallel running** — book on paper *and* in the system, reconcile nightly.
- [ ] One-page printed cheat sheet for the counter staff.

**Exit:** paper ledger retired.

---

## 4. Timeline

Roughly **6–7 weeks solo at a steady pace**, or **4 weeks focused full-time**.

| Week | Phases | Deliverable |
|---|---|---|
| 1 | 0 + 1 | Live shell, schema, login, audit |
| 2 | 2 | Seat layout engine + editor |
| 3 | 3 | Trips, fares, availability |
| 4 | **4** | **Hold/confirm + concurrency proven** |
| 5 | 5 | Bookings, payments, cancel, tickets |
| 6 | 6 | Reports, audit viewer, dashboard |
| 7 | 7 | Hardening, parallel run, go-live |

**Critical path:** Phase 2 → 3 → 4. Everything else can slip without blocking.

---

## 5. Testing Strategy

| Level | Tool | Coverage target |
|---|---|---|
| Unit | Vitest | `money.ts`, `pnr.ts`, fare resolution, cancellation policy, layout validation — 90%+ |
| Integration | Vitest + a real throwaway Postgres (local, or a Neon branch) | Every service in `server/services/` against a real DB. **Never mock the database** — the guarantees live in the DB. |
| **Concurrency** | Custom harness in `tests/concurrency/` | CT-1 … CT-7 from SRS §5.5, each run 100× in CI. This suite is non-negotiable. |
| E2E | Playwright | Login → book → print; two-context race test; cancel → rebook |
| Load | `scripts/load-test.ts` | 20 virtual agents, 5 min, assert zero double-sells and p95 < 400 ms |

**The single most important test to write first:** CT-1. Fire 50 concurrent
`POST /api/holds` for the same seat and assert exactly one `201`. If that is
green and stays green, the product's core promise holds.

---

## 6. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Double-selling a berth under load | Severe — customer conflict at the boarding point | DB-level `PK(trip_id, seat_id)` + `FOR UPDATE` + guarded UPDATE + row-count assertion. Proven by CT-1/CT-2 in CI. |
| Seats stuck `HELD` after a crash | Lost revenue | Dual expiry: lazy at read time *and* `pg_cron` sweep. Correctness never depends on the cron. |
| Serverless cold start slows the hold API | Agent double-clicks → duplicate | Idempotency keys make retries free; keep the hold path free of heavy imports. |
| Neon branch cold start | First query after idle is slow | Cron traffic keeps it warm; upgrade path is $19/mo, one click. |
| Agent clock skew breaks the countdown | Premature "expired" UI | Countdown uses server `expiresAt` + measured offset, and the server is always the arbiter. |
| Layout edited after tickets were sold | Wrong seat numbers on old tickets | Layouts freeze on first use; edits create a new version; trips pin their version. |
| Single role means anyone can delete masters | Data loss | Append-only audit log + soft delete (`is_active`) everywhere; nothing is hard-deleted. |
| Float rounding on fares | Money mismatches | All amounts are `bigint` paise. `money.ts` is the only place arithmetic happens. |
| Free-tier 0.5 GB fill-up | Growth stall | ~20 MB/year projected. Archive `trip_seat_state` for departed trips older than 1 year if it ever matters. |

---

## 7. Decisions Made For You (with rationale)

1. **Postgres, not a document store.** The entire value of this system is that
   berth `U7` on tomorrow's 21:00 bus cannot be sold twice. That is a
   transactional-integrity problem, and it decides the database.

2. **Seat state as its own table**, not a computed view over bookings. A
   dedicated `trip_seat_state` row per berth gives one physical object to lock,
   which turns a hard distributed-systems problem into a single row lock.

3. **Hold TTL of 10 minutes.** Long enough to count cash and fill a form, short
   enough that an abandoned hold doesn't block a real sale. Configurable.

4. **One role, deep audit.** You asked for one role; the correct trade is to
   make every action attributable rather than to restrict actions.

5. **Server Actions over a separate REST API for internal screens**, with real
   `/api` routes only where idempotency headers and external calls matter (hold,
   booking, cron). Fewer moving parts, same guarantees.

6. **No Redis, no queue, no microservices.** At 6 agents and ~130 berths a day,
   added infrastructure only adds failure modes.

---

## 8. Status

**Phases 0–2 are built and running.** See `README.md` for setup.

| Phase | State | Notes |
|---|---|---|
| 0 · Foundation | ✅ done | Next.js 16, Tailwind 4, Drizzle, dual Neon/local Postgres client |
| 1 · Schema & auth | ✅ done | 16 tables migrated and verified; JWT session auth; append-only audit log |
| 2 · Seat layout engine | ✅ done | Generator, validator, versioning, and the full manual editor |
| 3 · Trips & availability | ✅ done | Routes, points, schedules, generator, ad-hoc buses |
| 4 · Hold & confirm | ✅ done | 35 checks green, plus parked reservations |
| 5 · Booking lifecycle | 🟡 partial | Search, payments and **ticket printing** done; cancel and change-seats have tested services but no screen yet |
| 6 · Reports & audit | ⬜ | Collection, occupancy, audit viewer |
| 7 · Hardening | ⬜ | Rate limits, E2E, parallel run, go-live |

**Verified against a real database, not just typechecked:**
- Migration applies cleanly — 16 tables.
- The generated layout persists as 43 berths: 14 double sofas (7 per deck),
  10 single sofas (5 per deck), 5 cabin seats.
- Zero malformed sofa groups (every double has exactly one A and one B berth
  on a single deck).
- Rows 1–5 render `single · double`; row 6 renders `double · double`.
- `/masters/buses` and `/masters/buses/new` render the seat map server-side
  with all 43 berth labels and a live capacity summary.

## 9. Open Questions (answer before Phase 2)

1. **Deck split** — how do the 24 sleeper units divide between upper and lower?
   (Common: 12 up / 12 down, or 7 doubles + 5 singles per deck.) I will default
   to **7 doubles + 5 singles per deck** and you can drag-correct it in the editor.
2. **Cabin position** — are the 5 cabin seats front, rear, or a separate
   compartment? Affects only the rendering zone.
3. **Numbering convention** — `U1…U19 / L1…L19 / C1…C5`, or a single 1–43
   sequence, or your existing scheme? (Fully editable either way.)
4. **Double-sofa policy** — can a double be split between two unrelated
   passengers, or must it sell as a pair? (Default: `INDEPENDENT`.)
5. **Route** — actual origin/destination and departure times for onward and return.
6. **Fares** — price per berth type per direction.
7. **Cancellation policy** — the actual refund slabs your office uses.
8. **Hold TTL** — is 10 minutes right for your counter, or do you want 15?
