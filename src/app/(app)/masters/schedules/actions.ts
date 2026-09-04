"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requestMeta } from "@/server/auth";
import { scheduleTemplateSchema } from "@/lib/schemas";
import {
  saveSchedule, setScheduleActive, countRemovableFutureTrips,
} from "@/server/services/schedule";
import { failure, zodFailure, type ActionResult } from "@/server/errors";
import { serviceDateOf } from "@/lib/time";
import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { scheduleTemplate, trip } from "@/db/schema";
import { writeAudit } from "@/server/audit";

export async function saveScheduleAction(
  raw: unknown,
): Promise<ActionResult<{ scheduleId: string }>> {
  try {
    const session = await requireSession();
    const parsed = scheduleTemplateSchema.safeParse(raw);
    if (!parsed.success) return zodFailure(parsed.error);

    const meta = await requestMeta();
    const scheduleId = await saveSchedule({
      ...parsed.data,
      validTo: parsed.data.validTo ?? null,
      actorAgentId: session.agentId,
      ...meta,
    });

    revalidatePath("/masters/schedules");
    revalidatePath("/trips");
    return { ok: true, data: { scheduleId } };
  } catch (e) {
    return failure(e, "saveSchedule");
  }
}

export async function setScheduleActiveAction(
  scheduleId: string, isActive: boolean,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const meta = await requestMeta();
    await setScheduleActive({
      scheduleId, isActive, actorAgentId: session.agentId, ...meta,
    });
    revalidatePath("/masters/schedules");
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return failure(e, "setScheduleActive");
  }
}

/** What turning this schedule off would leave behind. */
export async function scheduleImpactAction(
  scheduleId: string,
): Promise<ActionResult<{ total: number; withBookings: number }>> {
  try {
    await requireSession();
    const impact = await countRemovableFutureTrips(scheduleId, serviceDateOf());
    return { ok: true, data: impact };
  } catch (e) {
    return failure(e, "scheduleImpact");
  }
}

export async function removeScheduleAction(scheduleId: string): Promise<ActionResult> {
    try {
      const session = await requireSession();
      await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(scheduleTemplate)
          .where(eq(scheduleTemplate.id, scheduleId)).limit(1);
        if (!existing) throw new Error("That schedule no longer exists.");
        await tx.update(scheduleTemplate).set({ isActive: false })
          .where(eq(scheduleTemplate.id, scheduleId));
        await tx.update(trip).set({ status: "CANCELLED" }).where(and(
          eq(trip.templateId, scheduleId), eq(trip.status, "SCHEDULED"),
          sql`${trip.serviceDate} >= to_char(current_date, 'YYYY-MM-DD')`,
        ));
        await writeAudit(tx, {
          agentId: session.agentId, action: "SCHEDULE_REMOVED",
          entityType: "schedule_template", entityId: scheduleId,
          before: existing, after: { ...existing, isActive: false },
        });
      });
      revalidatePath("/masters/schedules");
      revalidatePath("/trips");
      return { ok: true };
    } catch (e) {
      return failure(e, "removeSchedule");
    }
}
