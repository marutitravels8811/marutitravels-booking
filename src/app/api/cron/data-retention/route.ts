import { NextResponse, type NextRequest } from "next/server";
import { runAutomaticRetention } from "@/server/services/data-retention";
import { isAuthorizedCronRequest } from "@/server/cron-auth";

export const dynamic = "force-dynamic";

/** Automatic retention endpoint for cron-job.org or manual requests. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Bad or missing cron secret." } },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json({ ok: true, ...(await runAutomaticRetention()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cleanup failed" },
      { status: 500 },
    );
  }
}
