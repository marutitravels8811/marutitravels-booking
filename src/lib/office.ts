/**
 * Operator identity printed on every ticket.
 *
 * These live in the environment rather than the database because they change
 * roughly never, and a wrong phone number on a printed ticket is the kind of
 * thing that should require a deploy rather than a stray click in an admin
 * screen. Defaults are deliberately obvious placeholders so an unconfigured
 * deployment is caught at the first print, not by a customer.
 */
export interface OfficeDetails {
  name: string;
  tagline: string | null;
  phone: string | null;
  altPhone: string | null;
  address: string | null;
  email: string | null;
  gstin: string | null;
  terms: string[];
}

export function getOfficeDetails(): OfficeDetails {
  return {
    name: process.env.OFFICE_NAME || "SET OFFICE_NAME",
    tagline: process.env.OFFICE_TAGLINE || null,
    phone: process.env.OFFICE_PHONE || null,
    altPhone: process.env.OFFICE_ALT_PHONE || null,
    address: process.env.OFFICE_ADDRESS || null,
    email: process.env.OFFICE_EMAIL || null,
    gstin: process.env.OFFICE_GSTIN || null,
    terms: (process.env.OFFICE_TERMS ||
      "Report at the boarding point 15 minutes before departure." +
      "|Carry a photo ID; it may be checked before boarding." +
      "|Tickets are non-transferable. Cancellation charges apply as per office policy." +
      "|The operator is not responsible for luggage left unattended."
    ).split("|").map((t) => t.trim()).filter(Boolean),
  };
}
