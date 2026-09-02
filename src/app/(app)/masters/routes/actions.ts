"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { boardingPoint, route } from "@/db/schema";
import { requireSession, requestMeta } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { routeFormSchema } from "@/lib/schemas";

export interface RouteActionResult {
  ok: boolean;
  routeId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function saveRouteAction(raw: unknown): Promise<RouteActionResult> {
  const session = await requireSession();

  const parsed = routeFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path.join(".");
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, error: parsed.error.issues[0]?.message, fieldErrors };
  }

  const v = parsed.data;
  const meta = await requestMeta();

  try {
    const routeId = await db.transaction(async (tx) => {
      let id = v.id;
      let before: unknown = null;

      if (id) {
        const [existing] = await tx.select().from(route).where(eq(route.id, id)).limit(1);
        if (!existing) throw new Error("That route no longer exists.");
        before = existing;
        await tx.update(route).set({
          code: v.code, origin: v.origin, destination: v.destination,
          distanceKm: v.distanceKm ?? null,
          defaultDurationMin: v.defaultDurationMin ?? null,
          isActive: v.isActive,
        }).where(eq(route.id, id));
      } else {
        const [created] = await tx.insert(route).values({
          code: v.code, origin: v.origin, destination: v.destination,
          distanceKm: v.distanceKm ?? null,
          defaultDurationMin: v.defaultDurationMin ?? null,
          isActive: v.isActive,
        }).returning();
        id = created.id;
      }

      // Points that bookings already reference are deactivated rather than
      // deleted, so a printed ticket's pickup never becomes a dangling id.
      const keepIds = v.points.map((p) => p.id).filter((x): x is string => !!x);
      await tx.update(boardingPoint).set({ isActive: false }).where(
        keepIds.length
          ? and(eq(boardingPoint.routeId, id), notInArray(boardingPoint.id, keepIds))
          : eq(boardingPoint.routeId, id),
      );

      for (const p of v.points) {
        if (p.id) {
          await tx.update(boardingPoint).set({
            name: p.name, address: p.address || null, kind: p.kind,
            sequence: p.sequence, offsetMinutes: p.offsetMinutes, isActive: true,
          }).where(eq(boardingPoint.id, p.id));
        } else {
          await tx.insert(boardingPoint).values({
            routeId: id, name: p.name, address: p.address || null,
            kind: p.kind, sequence: p.sequence, offsetMinutes: p.offsetMinutes,
          });
        }
      }

      await writeAudit(tx, {
        agentId: session.agentId,
        action: v.id ? "ROUTE_UPDATED" : "ROUTE_CREATED",
        entityType: "route", entityId: id,
        before, after: { ...v, pointCount: v.points.length }, ...meta,
      });

      return id;
    });

    revalidatePath("/masters/routes");
    return { ok: true, routeId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (msg.includes("route_code_uq")) {
      return { ok: false, error: "Another route already uses that code.",
               fieldErrors: { code: "Already in use" } };
    }
    return { ok: false, error: msg };
  }
}
