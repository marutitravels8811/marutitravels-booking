import { db } from "@/db";
import { officeSetting } from "@/db/schema";
import { AppError } from "@/server/errors";

export interface OfficeSettingValues {
  address: string;
  phone: string;
  altAddress: string;
  altPhone: string;
}

export async function getOfficeSetting(): Promise<OfficeSettingValues> {
  const [row] = await db.select().from(officeSetting).limit(1);
  return {
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    altAddress: row?.altAddress ?? "",
    altPhone: row?.altPhone ?? "",
  };
}

export async function saveOfficeSetting(values: OfficeSettingValues, agentId: string) {
  const [row] = await db.insert(officeSetting).values({
    id: 1,
    address: values.address || null,
    phone: values.phone || null,
    altAddress: values.altAddress || null,
    altPhone: values.altPhone || null,
    updatedBy: agentId,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: officeSetting.id,
    set: {
      address: values.address || null,
      phone: values.phone || null,
      altAddress: values.altAddress || null,
      altPhone: values.altPhone || null,
      updatedBy: agentId,
      updatedAt: new Date(),
    },
  }).returning();
  if (!row) throw new AppError("OFFICE_SETTINGS_FAILED", "Could not save office details.");
  return getOfficeSetting();
}
