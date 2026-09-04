"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth";
import {
  listActiveHolds, releaseHold, extendHold, setHoldProvisional,
  type ActiveHoldRow,
} from "@/server/services/seat-hold";
import { failure } from "@/server/errors";

export interface HoldSummary {
  holdId: string;
  tripId: string;
  agentName: string;
  isMine: boolean;
  expiresAt: string;
  extensionCount: number;
  provisionalName: string | null;
  provisionalPhone: string | null;
  seatNumbers: string[];
  serviceDate: string;
  direction: "ONWARD" | "RETURN";
  departureAt: string;
  origin: string;
  destination: string;
  busName: string;
}

function toSummary(h: ActiveHoldRow): HoldSummary {
  return {
    holdId: h.holdId,
    tripId: h.tripId,
    agentName: h.agentName,
    isMine: h.isMine,
    expiresAt: h.expiresAt.toISOString(),
    extensionCount: h.extensionCount,
    provisionalName: h.provisionalName,
    provisionalPhone: h.provisionalPhone,
    seatNumbers: h.seatNumbers,
    serviceDate: h.serviceDate,
    direction: h.direction,
    departureAt: h.departureAt.toISOString(),
    origin: h.origin,
    destination: h.destination,
    busName: h.busName,
  };
}

export async function listHoldsAction(mineOnly = false): Promise<{
  holds: HoldSummary[]; serverNow: string;
}> {
  const session = await requireSession();
  const rows = await listActiveHolds(session.agentId, { mineOnly });
  return { holds: rows.map(toSummary), serverNow: new Date().toISOString() };
}

export async function releaseHoldFromTrayAction(
  holdId: string, reason?: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const session = await requireSession();
    await releaseHold({ holdId, agentId: session.agentId, reason: reason ?? null });
    revalidatePath("/holds");
    revalidatePath("/trips");
    return { ok: true };
  } catch (e) {
    return failure(e, "releaseHoldFromTray");
  }
}

export async function extendHoldFromTrayAction(
  holdId: string, ttlMinutes = 30,
): Promise<{ ok: boolean; expiresAt?: string; error?: string; code?: string }> {
  try {
    const session = await requireSession();
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 24 * 60) {
      return { ok: false, error: "Choose an extension between 1 minute and 24 hours." };
    }
    const r = await extendHold({ holdId, agentId: session.agentId, ttlMinutes });
    revalidatePath("/holds");
    return { ok: true, expiresAt: r.expiresAt.toISOString() };
  } catch (e) {
    return failure(e, "extendHoldFromTray");
  }
}

export async function saveHoldCustomerAction(
  holdId: string, name: string, phone: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const session = await requireSession();
    await setHoldProvisional({
      holdId, agentId: session.agentId,
      provisionalName: name, provisionalPhone: phone,
    });
    revalidatePath("/holds");
    return { ok: true };
  } catch (e) {
    return failure(e, "saveHoldCustomer");
  }
}
