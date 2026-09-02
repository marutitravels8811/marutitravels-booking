import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { agent, bus, route } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { generateStandardLayout } from "../src/lib/seat-layout";
import { saveLayoutVersion } from "../src/server/services/layout";

const EMAIL = process.env.SEED_EMAIL ?? "admin@office.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "changeme123";

async function main() {
  console.log("Seeding…");

  let [first] = await db.select().from(agent).where(eq(agent.email, EMAIL)).limit(1);
  if (!first) {
    [first] = await db.insert(agent).values({
      name: process.env.SEED_NAME ?? "Office Admin",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
    }).returning();
    console.log(`  agent   ${EMAIL} / ${PASSWORD}`);
  } else {
    console.log(`  agent   ${EMAIL} (already exists)`);
  }

  const [existingRoute] = await db.select().from(route)
    .where(eq(route.code, "RJT-BOM")).limit(1);
  if (!existingRoute) {
    await db.insert(route).values({
      code: "RJT-BOM",
      origin: "Rajkot",
      destination: "Mumbai",
      distanceKm: 640,
      defaultDurationMin: 660,
    });
    console.log("  route   RJT-BOM Rajkot → Mumbai");
  }

  const [existingBus] = await db.select().from(bus)
    .where(eq(bus.registrationNo, "GJ 03 AA 0001")).limit(1);
  if (!existingBus) {
    await db.transaction(async (tx) => {
      const [b] = await tx.insert(bus).values({
        registrationNo: "GJ 03 AA 0001",
        displayName: "Sleeper 1",
        note: "38 sleeper + 5 cabin",
      }).returning();
      const draft = generateStandardLayout();
      const r = await saveLayoutVersion(tx, {
        busId: b.id, draft, agentId: first.id, baseLayoutId: null,
      });
      console.log(`  bus     Sleeper 1 · layout v${r.version} · ${draft.seats.length} berths`);
    });
  } else {
    console.log("  bus     Sleeper 1 (already exists)");
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
