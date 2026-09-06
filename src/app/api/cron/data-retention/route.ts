import { NextResponse, type NextRequest } from "next/server";
import { runAutomaticRetention } from "@/server/services/data-retention";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ ok: true, ...(await runAutomaticRetention()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "cleanup failed" },
      { status: 500 },
    );
  }
}
