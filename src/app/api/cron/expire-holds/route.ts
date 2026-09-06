import { NextResponse, type NextRequest } from "next/server";
import { expireStaleHolds } from "@/server/services/seat-hold";
import { isAuthorizedCronRequest } from "@/server/cron-auth";

export const dynamic = "force-dynamic";

/** Housekeeping endpoint for cron-job.org or manual requests. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
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
