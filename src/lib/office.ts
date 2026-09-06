/**
 * Operator identity printed on every ticket.
 *
 * The two office addresses and phone numbers are stored in the admin panel so
 * ticket corrections do not require an environment change or redeployment.
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

import { db } from "@/db";
import { officeSetting } from "@/db/schema";

export async function getOfficeDetails(): Promise<OfficeDetails> {
  const [setting] = await db.select().from(officeSetting).limit(1);
  return {
    name: process.env.OFFICE_NAME || "SET OFFICE_NAME",
    tagline: process.env.OFFICE_TAGLINE || null,
    phone: setting?.phone ?? null,
    altPhone: setting?.altPhone ?? null,
    address: setting?.address ?? null,
    altAddress: setting?.altAddress ?? null,
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
