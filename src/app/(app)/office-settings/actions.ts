"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { failure } from "@/server/errors";
import { getOfficeSetting, saveOfficeSetting } from "@/server/services/office-settings";

const officeSchema = z.object({
  address: z.string().trim().max(500),
  phone: z.string().trim().max(100),
  altAddress: z.string().trim().max(500),
  altPhone: z.string().trim().max(100),
});

export async function saveOfficeSettingsAction(raw: unknown) {
  try {
    const session = await requireSession();
    const values = officeSchema.parse(raw);
    const settings = await saveOfficeSetting(values, session.agentId);
    revalidatePath("/office-settings");
    revalidatePath("/tickets", "layout");
    revalidatePath("/trips", "layout");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: failure(e, "saveOfficeSettings").error };
  }
}

export async function getOfficeSettingsAction() {
  await requireSession();
  return getOfficeSetting();
}
