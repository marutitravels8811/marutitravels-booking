import type { NextRequest } from "next/server";

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  return authorization === `Bearer ${secret}` || headerSecret === secret;
}
