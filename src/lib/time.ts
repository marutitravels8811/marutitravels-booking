export const OFFICE_TZ = process.env.OFFICE_TIMEZONE ?? "Asia/Kolkata";

/** YYYY-MM-DD in the office timezone, for `service_date`. */
export function serviceDateOf(d: Date = new Date(), tz = OFFICE_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function formatDateTime(d: Date | string, tz = OFFICE_TZ): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz, dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

export function formatTime(d: Date | string, tz = OFFICE_TZ): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(date);
}
