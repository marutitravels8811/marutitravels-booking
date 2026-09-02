import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { agent, boardingPoint, bus, route, scheduleTemplate } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { generateStandardLayout } from "../src/lib/seat-layout";
import { saveLayoutVersion } from "../src/server/services/layout";
import { generateTrips } from "../src/server/services/trip";
import { serviceDateOf } from "../src/lib/time";

const EMAIL = process.env.SEED_EMAIL ?? "admin@office.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "changeme123";
const TZ = process.env.OFFICE_TIMEZONE ?? "Asia/Kolkata";

async function main() {
  console.log("Seeding…");

  let [first] = await db.select().from(agent).where(eq(agent.email, EMAIL)).limit(1);
  if (!first) {
    [first] = await db.insert(agent).values({
      name: process.env.SEED_NAME ?? "Office Admin",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
    }).returning();
    console.log(`  agent    ${EMAIL} / ${PASSWORD}`);
  } else {
    console.log(`  agent    ${EMAIL} (already exists)`);
  }

  let [r] = await db.select().from(route).where(eq(route.code, "RJT-BOM")).limit(1);
  if (!r) {
    [r] = await db.insert(route).values({
      code: "RJT-BOM", origin: "Rajkot", destination: "Mumbai",
      distanceKm: 640, defaultDurationMin: 660,
    }).returning();
    await db.insert(boardingPoint).values([
      { routeId: r.id, name: "Bus Stand", kind: "BOARDING", sequence: 0, offsetMinutes: 0 },
      { routeId: r.id, name: "Gondal Chowkdi", kind: "BOARDING", sequence: 1, offsetMinutes: 25 },
      { routeId: r.id, name: "Borivali", kind: "DROPPING", sequence: 0, offsetMinutes: -60 },
      { routeId: r.id, name: "Dadar", kind: "DROPPING", sequence: 1, offsetMinutes: 0 },
    ]);
    console.log("  route    RJT-BOM Rajkot → Mumbai, 2 pickups, 2 drops");
  } else {
    console.log("  route    RJT-BOM (already exists)");
  }

  const buses: { id: string; name: string }[] = [];
  for (const [reg, name] of [
    ["GJ 03 AA 0001", "Sleeper 1"],
    ["GJ 03 AA 0002", "Sleeper 2"],
  ] as const) {
    const [existing] = await db.select().from(bus)
      .where(eq(bus.registrationNo, reg)).limit(1);

    // A bus with no layout cannot be scheduled, so seeding heals that case
    // rather than skipping it — otherwise a half-cleaned database stays broken
    // and the trip generator fails with a confusing message.
    if (existing?.currentLayoutId) {
      buses.push({ id: existing.id, name });
      console.log(`  bus      ${name} (already exists)`);
      continue;
    }

    const id = await db.transaction(async (tx) => {
      let busId = existing?.id;
      if (!busId) {
        const [b] = await tx.insert(bus).values({
          registrationNo: reg, displayName: name,
          note: "38 sleeper + 5 cabin",
          fareSingleSofaPaise: 90000,   // ₹900
          fareDoubleSofaPaise: 80000,   // ₹800 per berth
          fareCabinPaise: 120000,       // ₹1200
        }).returning();
        busId = b.id;
      }
      const draft = generateStandardLayout();
      const res = await saveLayoutVersion(tx, {
        busId, draft, agentId: first.id, baseLayoutId: null,
      });
      console.log(
        `  bus      ${name} · layout v${res.version} · ${draft.seats.length} berths` +
        (existing ? " (layout restored)" : ""),
      );
      return busId;
    });
    buses.push({ id, name });
  }

  const [tpl] = await db.select().from(scheduleTemplate).limit(1);
  if (!tpl) {
    await db.insert(scheduleTemplate).values([
      {
        routeId: r.id, busId: buses[0].id, direction: "ONWARD",
        departureTime: "21:00", arrivalTime: "08:00",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validFrom: new Date("2020-01-01T00:00:00Z"),
      },
      {
        routeId: r.id, busId: buses[0].id, direction: "RETURN",
        departureTime: "20:00", arrivalTime: "07:00",
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        validFrom: new Date("2020-01-01T00:00:00Z"),
      },
    ]);
    console.log("  schedule daily 21:00 onward, 20:00 return");
  } else {
    console.log("  schedule (already exists)");
  }

  const today = serviceDateOf(new Date(), TZ);
  const to = new Date(`${today}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 14);
  const gen = await generateTrips({
    fromDate: today, toDate: to.toISOString().slice(0, 10),
    timeZone: TZ, agentId: first.id,
  });
  console.log(`  trips    ${gen.created} created, ${gen.skipped} already existed`);
  if (gen.errors.length) console.log("  errors  ", gen.errors.slice(0, 3));

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
