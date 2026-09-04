"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bus, trip } from "@/db/schema";
import { requireSession, requestMeta } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { busFormSchema } from "@/lib/schemas";
import { saveLayoutVersion } from "@/server/services/layout";
import { failure, zodFailure, AppError } from "@/server/errors";

export interface BusActionResult {
  ok: boolean;
  busId?: string;
  createdNewVersion?: boolean;
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

export async function saveBusAction(raw: unknown): Promise<BusActionResult> {
  const session = await requireSession();

  const parsed = busFormSchema.safeParse(raw);
  if (!parsed.success) return zodFailure(parsed.error);

  const v = parsed.data;
  const meta = await requestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      let busId = v.id;
      let before: unknown = null;

      if (busId) {
        const [existing] = await tx.select().from(bus).where(eq(bus.id, busId)).limit(1);
        if (!existing) {
          throw new AppError("BUS_NOT_FOUND",
            "That bus no longer exists. It may have been removed by another agent.");
        }

        before = existing;
        await tx.update(bus).set({
          registrationNo: v.registrationNo,
          displayName: v.displayName,
          note: v.note || null,
          isActive: v.isActive,
          fareSingleSofaPaise: v.fareSingleSofa,
          fareDoubleSofaPaise: v.fareDoubleSofa,
          fareCabinPaise: v.fareCabin,
          extraPersonSinglePaise: v.extraPersonSingle,
          extraPersonDoublePaise: v.extraPersonDouble,
        }).where(eq(bus.id, busId));
      } else {
        const [created] = await tx.insert(bus).values({
          registrationNo: v.registrationNo,
          displayName: v.displayName,
          note: v.note || null,
          isActive: v.isActive,
          fareSingleSofaPaise: v.fareSingleSofa,
          fareDoubleSofaPaise: v.fareDoubleSofa,
          fareCabinPaise: v.fareCabin,
          extraPersonSinglePaise: v.extraPersonSingle,
          extraPersonDoublePaise: v.extraPersonDouble,
        }).returning();
        busId = created.id;
      }

      const [current] = await tx.select({ layoutId: bus.currentLayoutId })
        .from(bus).where(eq(bus.id, busId!)).limit(1);

      const layoutResult = await saveLayoutVersion(tx, {
        busId: busId!,
        draft: v.layout,
        agentId: session.agentId,
        baseLayoutId: current?.layoutId ?? null,
      });

      await writeAudit(tx, {
        agentId: session.agentId,
        action: v.id ? "BUS_UPDATED" : "BUS_CREATED",
        entityType: "bus",
        entityId: busId!,
        before,
        after: { ...v, layout: { seatCount: v.layout.seats.length } },
        ...meta,
      });

      return { busId: busId!, createdNewVersion: layoutResult.createdNewVersion };
    });

    revalidatePath("/masters/buses");
    return { ok: true, ...result };
  } catch (e) {
    return failure(e, "saveBus");
  }

}

export async function removeBusAction(busId: string): Promise<BusActionResult> {
  const session = await requireSession();
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(bus).where(eq(bus.id, busId)).limit(1);
      if (!existing) throw new AppError("BUS_NOT_FOUND", "That bus no longer exists.");
      await tx.update(bus).set({ isActive: false }).where(eq(bus.id, busId));
      await tx.update(trip).set({ status: "CANCELLED" })
        .where(and(eq(trip.busId, busId), eq(trip.status, "SCHEDULED"),
          sql`${trip.serviceDate} >= to_char(current_date, 'YYYY-MM-DD')`));
      await writeAudit(tx, {
        agentId: session.agentId, action: "BUS_REMOVED", entityType: "bus", entityId: busId,
        before: existing, after: { ...existing, isActive: false },
      });
      return { busId };
    });
    revalidatePath("/masters/buses");
    return { ok: true, ...result };
  } catch (e) {
    return failure(e, "removeBus");
  }
}
