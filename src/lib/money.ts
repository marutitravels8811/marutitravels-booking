/**
 * All money is stored as integer paise. Nothing in this codebase performs
 * arithmetic on rupee floats — that is what this module exists to prevent.
 */
export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === "string" ? Number(rupees.replace(/[^\d.-]/g, "")) : rupees;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${rupees}`);
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
