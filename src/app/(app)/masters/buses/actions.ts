"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bus } from "@/db/schema";
import { requireSession, requestMeta } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { busFormSchema } from "@/lib/schemas";
import { saveLayoutVersion, LayoutError } from "@/server/services/layout";

export interface BusActionResult {
  ok: boolean;
  busId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  createdNewVersion?: boolean;
}

export async function saveBusAction(raw: unknown): Promise<BusActionResult> {
  const session = await requireSession();

  const parsed = busFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form",
      fieldErrors,
    };
  }

  const v = parsed.data;
  const meta = await requestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      let busId = v.id;
      let before: unknown = null;

      if (busId) {
        const [existing] = await tx.select().from(bus).where(eq(bus.id, busId)).limit(1);
        if (!existing) throw new LayoutError("BUS_NOT_FOUND", "That bus no longer exists.");
        before = existing;
        await tx.update(bus).set({
          registrationNo: v.registrationNo,
          displayName: v.displayName,
          note: v.note || null,
          isActive: v.isActive,
          fareSingleSofaPaise: v.fareSingleSofa,
          fareDoubleSofaPaise: v.fareDoubleSofa,
          fareCabinPaise: v.fareCabin,
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
    if (e instanceof LayoutError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (msg.includes("bus_reg_uq")) {
      return {
        ok: false,
        error: "Another bus already uses that registration number.",
        fieldErrors: { registrationNo: "Already in use" },
      };
    }
    if (msg.includes("seat_layout_number_uq")) {
      return { ok: false, error: "Two berths share the same seat number." };
    }
    return { ok: false, error: msg };
  }
}
