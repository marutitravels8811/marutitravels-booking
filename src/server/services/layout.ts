// Server-side only. Not marked `server-only` so seeding scripts and the
// concurrency test harness can call these services directly under tsx;
// they import the pg driver, which cannot be bundled for the client anyway.
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { bus, seat, seatLayout, trip } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { validateLayout, type DraftLayout, type DraftSeat } from "@/lib/seat-layout";

export class LayoutError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Persist a draft layout as a new version for a bus.
 *
 * Layouts are immutable once a trip has used them: editing a used layout
 * creates version N+1 and leaves the old version untouched, so tickets already
 * printed keep matching the seats they were sold against.
 */
export async function saveLayoutVersion(
  tx: Tx,
  params: {
    busId: string;
    draft: DraftLayout;
    agentId: string;
    /** existing layout being edited, if any */
    baseLayoutId?: string | null;
  },
): Promise<{ layoutId: string; version: number; createdNewVersion: boolean }> {
  const { busId, draft, agentId, baseLayoutId } = params;

  const issues = validateLayout(draft).filter((i) => i.level === "error");
  if (issues.length > 0) {
    throw new LayoutError("LAYOUT_INVALID", issues.map((i) => i.message).join(" "));
  }

  let reuseLayoutId: string | null = null;
  if (baseLayoutId) {
    const [base] = await tx.select().from(seatLayout)
      .where(eq(seatLayout.id, baseLayoutId)).limit(1);
    if (base) {
      const [used] = await tx.select({ n: sql<number>`count(*)::int` })
        .from(trip).where(eq(trip.layoutId, base.id));
      // never mutate a layout a trip is pointing at
      if (!base.isFrozen && (used?.n ?? 0) === 0) reuseLayoutId = base.id;
    }
  }

  const [{ maxVersion }] = await tx
    .select({ maxVersion: sql<number>`coalesce(max(${seatLayout.version}), 0)::int` })
    .from(seatLayout).where(eq(seatLayout.busId, busId));

  let layoutId: string;
  let version: number;

  if (reuseLayoutId) {
    const [row] = await tx.update(seatLayout).set({
      name: draft.name,
      doubleSofaPolicy: draft.doubleSofaPolicy,
      sleeperRows: draft.sleeperRows,
      sleeperCols: draft.sleeperCols,
      cabinRows: draft.cabinRows,
      cabinCols: draft.cabinCols,
    }).where(eq(seatLayout.id, reuseLayoutId)).returning();
    layoutId = row.id;
    version = row.version;
    await tx.delete(seat).where(eq(seat.layoutId, layoutId));
  } else {
    version = maxVersion + 1;
    const [row] = await tx.insert(seatLayout).values({
      busId, version, name: draft.name,
      doubleSofaPolicy: draft.doubleSofaPolicy,
      sleeperRows: draft.sleeperRows,
      sleeperCols: draft.sleeperCols,
      cabinRows: draft.cabinRows,
      cabinCols: draft.cabinCols,
      createdBy: agentId,
    }).returning();
    layoutId = row.id;
  }

  // map client-side sofa group keys onto real uuids, keeping pairs together
  const groupIds = new Map<string, string>();
  const seatRows = draft.seats.map((s: DraftSeat, i) => {
    let sofaGroupId: string | null = null;
    if (s.sofaGroupKey) {
      if (!groupIds.has(s.sofaGroupKey)) groupIds.set(s.sofaGroupKey, crypto.randomUUID());
      sofaGroupId = groupIds.get(s.sofaGroupKey)!;
    }
    return {
      layoutId,
      seatNumber: s.seatNumber.trim().toUpperCase(),
      deck: s.deck,
      berthType: s.berthType,
      sofaGroupId,
      sofaPosition: s.sofaPosition,
      rowIndex: s.rowIndex,
      colIndex: s.colIndex,
      sortOrder: s.sortOrder ?? i,
      isActive: s.isActive,
    };
  });

  await tx.insert(seat).values(seatRows);
  await tx.update(bus).set({ currentLayoutId: layoutId }).where(eq(bus.id, busId));

  await writeAudit(tx, {
    agentId,
    action: reuseLayoutId ? "LAYOUT_UPDATED" : "LAYOUT_VERSION_CREATED",
    entityType: "seat_layout",
    entityId: layoutId,
    after: { busId, version, seatCount: seatRows.length, name: draft.name },
  });

  return { layoutId, version, createdNewVersion: !reuseLayoutId };
}

/** Load a stored layout back into the editor's draft shape. */
export async function loadDraftLayout(layoutId: string): Promise<DraftLayout | null> {
  const [layout] = await db.select().from(seatLayout)
    .where(eq(seatLayout.id, layoutId)).limit(1);
  if (!layout) return null;

  const seats = await db.select().from(seat)
    .where(eq(seat.layoutId, layoutId))
    .orderBy(seat.sortOrder);

  return {
    name: layout.name,
    doubleSofaPolicy: layout.doubleSofaPolicy,
    sleeperRows: layout.sleeperRows,
    sleeperCols: layout.sleeperCols,
    cabinRows: layout.cabinRows,
    cabinCols: layout.cabinCols,
    seats: seats.map((s) => ({
      key: s.id,
      seatNumber: s.seatNumber,
      deck: s.deck,
      berthType: s.berthType,
      sofaGroupKey: s.sofaGroupId,
      sofaPosition: s.sofaPosition,
      rowIndex: s.rowIndex,
      colIndex: s.colIndex,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    })),
  };
}

/** True once any trip references this layout — the editor then clones instead. */
export async function isLayoutInUse(layoutId: string): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(trip).where(eq(trip.layoutId, layoutId));
  return (row?.n ?? 0) > 0;
}
