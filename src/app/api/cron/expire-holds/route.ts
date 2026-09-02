import { NextResponse, type NextRequest } from "next/server";
import { expireStaleHolds } from "@/server/services/seat-hold";

export const dynamic = "force-dynamic";

/**
 * Sweeps holds whose time has run out.
 *
 * This is housekeeping, not a correctness mechanism: `createHold` and every
 * seat-map read already treat an expired hold as free. If this job never ran,
 * no seat would be lost — the map would just keep showing stale reservations
 * as someone else's until the next attempt to take them.
 *
 * Schedule it once a minute (vercel.json), or hit it manually.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Bad or missing cron secret." } },
      { status: 401 },
    );
  }

  try {
    const result = await expireStaleHolds();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 },
    );
  }
}
