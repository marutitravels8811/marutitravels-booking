import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { agent } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

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
    console.log(`  agent    ${EMAIL} / ${PASSWORD}`);
  } else {
    console.log(`  agent    ${EMAIL} (already exists)`);
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
