"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { failure } from "@/server/errors";
import {
  deleteRetentionData, getRetentionSettings, previewRetention,
  updateRetentionSettings, type RetentionSelection,
} from "@/server/services/data-retention";

const selectionSchema = z.object({
  bookings: z.boolean(),
  expiredHolds: z.boolean(),
  completedTrips: z.boolean(),
  idempotencyKeys: z.boolean(),
});

const daysSchema = z.coerce.number().int().min(1).max(3650);

function parseSelection(raw: unknown): RetentionSelection {
  const parsed = selectionSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Select valid cleanup categories.");
  return parsed.data;
}

export async function getRetentionPreviewAction(raw: {
  days: number;
  selection: RetentionSelection;
}) {
  try {
    await requireSession();
    return { ok: true, preview: await previewRetention(daysSchema.parse(raw.days), parseSelection(raw.selection)) };
  } catch (e) {
    return { ok: false, error: failure(e, "previewRetention").error };
  }
}

export async function deleteRetentionDataAction(raw: {
  days: number;
  selection: RetentionSelection;
  confirmation: string;
}) {
  try {
    const session = await requireSession();
    if (raw.confirmation.trim() !== "DELETE") {
      return { ok: false, error: "Type DELETE to confirm permanent removal." };
    }
    const selection = parseSelection(raw.selection);
    const result = await deleteRetentionData(daysSchema.parse(raw.days), selection);
    revalidatePath("/data-retention");
    revalidatePath("/bookings");
    revalidatePath("/trips");
    return { ok: true, result, performedBy: session.name };
  } catch (e) {
    return { ok: false, error: failure(e, "deleteRetentionData").error };
  }
}

export async function saveRetentionSettingsAction(raw: {
  enabled: boolean;
  retentionDays: number;
  frequency: "DAILY" | "WEEKLY";
  selection: RetentionSelection;
}) {
  try {
    const session = await requireSession();
    const selection = parseSelection(raw.selection);
    const values = {
      enabled: Boolean(raw.enabled),
      retentionDays: daysSchema.parse(raw.retentionDays),
      frequency: raw.frequency === "WEEKLY" ? "WEEKLY" as const : "DAILY" as const,
      ...selection,
      lastRunAt: null,
    };
    const settings = await updateRetentionSettings(values, session.agentId);
    revalidatePath("/data-retention");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: failure(e, "saveRetentionSettings").error };
  }
}

export async function getRetentionSettingsAction() {
  await requireSession();
  return getRetentionSettings();
}
