import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Two drivers, one interface.
 *
 * Production runs on Neon over its WebSocket `Pool` — deliberately *not* the
 * HTTP `neon()` driver, which cannot run interactive transactions. The seat
 * hold and booking-confirm paths depend on
 * `BEGIN … SELECT FOR UPDATE … UPDATE … COMMIT` in one session, so switching to
 * the HTTP driver would silently break the no-double-booking guarantee.
 *
 * Local development points DATABASE_URL at a plain Postgres and uses
 * node-postgres. Drizzle presents an identical transaction API over both, so
 * nothing above this file needs to know which one is in play — the exported
 * type is the node-postgres one for both.
 */

type AppDatabase = NodePgDatabase<typeof schema>;

interface Client {
  db: AppDatabase;
  pool: { end: () => Promise<void> };
}

const url = process.env.DATABASE_URL ?? "";
const isNeon = /neon\.(tech|build)/.test(url);

function build(): Client {
  if (isNeon) {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new NeonPool({ connectionString: url, max: 10 });
    return {
      db: drizzleNeon(pool, { schema, casing: "snake_case" }) as unknown as AppDatabase,
      pool,
    };
  }
  const pool = new PgPool({ connectionString: url, max: 10 });
  return { db: drizzlePg(pool, { schema, casing: "snake_case" }), pool };
}

const globalForDb = globalThis as unknown as { __client?: Client };
const client: Client = globalForDb.__client ?? build();
if (process.env.NODE_ENV !== "production") globalForDb.__client = client;

export const db = client.db;
export const pool = client.pool;
export type DB = AppDatabase;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
