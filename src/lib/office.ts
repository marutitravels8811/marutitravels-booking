/**
 * Operator identity printed on every ticket.
 *
 * These live in the environment rather than the database because they change
 * roughly never, and a wrong phone number on a stack of printed tickets should
 * require a deploy rather than a stray click in an admin screen. Defaults are
 * deliberately obvious placeholders so an unconfigured deployment is caught at
 * the first print, not by a customer.
 */
export interface OfficeDetails {
  name: string;
  tagline: string | null;
  phone: string | null;
  altPhone: string | null;
  address: string | null;
  altAddress: string | null;
  email: string | null;
  gstin: string | null;
  /** short clauses, printed as one line on a compact ticket */
  terms: string[];
}

export function getOfficeDetails(): OfficeDetails {
  return {
    name: process.env.OFFICE_NAME || "SET OFFICE_NAME",
    tagline: process.env.OFFICE_TAGLINE || null,
    phone: process.env.OFFICE_PHONE || null,
    altPhone: process.env.OFFICE_ALT_PHONE || null,
    address: process.env.OFFICE_ADDRESS || null,
    altAddress: process.env.OFFICE_ALT_ADDRESS || null,
    email: process.env.OFFICE_EMAIL || null,
    gstin: process.env.OFFICE_GSTIN || null,
    terms: (process.env.OFFICE_TERMS ||
      "Report 15 min before departure|Carry photo ID|Non-transferable"
    ).split("|").map((t) => t.trim()).filter(Boolean),
  };
}

export function contactLine(o: OfficeDetails): string {
  return [o.phone, o.altPhone].filter(Boolean).join(" / ");
}
