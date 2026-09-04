/**
 * A short, human-readable booking reference an agent can read over the phone.
 * Format: `ST-040926-0001` onward or `KMB-040926-0001` return. The route end,
 * travel date, and incrementing number are easy to read at the counter.
 */
export function generatePnr(
  routeCode: string, serviceDate: string, direction: "ONWARD" | "RETURN", number: number,
): string {
  const parts = routeCode.split("-").map((part) => part.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
    .filter(Boolean);
  const prefix = (direction === "RETURN" ? parts.at(-1) : parts[0]) || "BK";
  const [year, month, day] = serviceDate.split("-");
  const date = `${day ?? "01"}${month ?? "01"}${(year ?? "2000").slice(-2)}`; // DDMMYY
  return `${prefix}-${date}-${String(number % 10000).padStart(4, "0")}`;
}
