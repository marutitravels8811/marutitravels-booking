const ALPHABET = "ACDEFHJKLMNPRTUVWXY349"; // no 0/O, 1/I, 2/Z, 5/S, 8/B, 6/G

/**
 * A short, human-readable booking reference an agent can read over the phone.
 * Format: `AB-260902-K4T9`. The random tail is what makes it unique; the date
 * segment is there so staff can eyeball roughly when a booking was made.
 */
export function generatePnr(routeCode: string, serviceDate: string): string {
  const prefix = routeCode.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "BK";
  const date = serviceDate.replace(/-/g, "").slice(2); // YYMMDD
  let tail = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) tail += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${date}-${tail}`;
}
