/**
 * Seat selection rules, kept pure so they can be tested without a browser.
 *
 * The rule that matters: a double sofa is one piece of furniture. Clicking
 * either half takes both, because that is what a customer buying "a double"
 * expects. Selling one half alone puts a stranger on the same sofa, so the
 * caller must confirm that deliberately.
 */

export interface SelectableSeat {
  seatId: string;
  seatNumber: string;
  sofaGroupId: string | null;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
  isActive: boolean;
}

export function isSelectable(s: SelectableSeat | null | undefined): boolean {
  return !!s && s.status === "AVAILABLE" && s.isActive;
}

export function partnerOf<T extends SelectableSeat>(
  seats: T[], row: T,
): T | null {
  if (!row.sofaGroupId) return null;
  return seats.find(
    (s) => s.sofaGroupId === row.sofaGroupId && s.seatId !== row.seatId) ?? null;
}

export interface SplitPrompt {
  seatId: string;
  seatNumber: string;
  partnerNumber: string;
}

export interface ToggleOutcome {
  /** the new selection, or the unchanged one when confirmation is needed */
  selected: Set<string>;
  /** set when the caller must confirm splitting a double sofa */
  confirmSplit?: SplitPrompt;
}

export function toggleSeat<T extends SelectableSeat>(
  seats: T[], selected: Set<string>, seatId: string,
): ToggleOutcome {
  const row = seats.find((s) => s.seatId === seatId);
  if (!isSelectable(row)) return { selected };

  const partner = partnerOf(seats, row!);
  const wasSelected = selected.has(seatId);
  const partnerSelected = partner ? selected.has(partner.seatId) : false;

  // removing one half while the other stays selected splits the sofa
  if (wasSelected && partner && partnerSelected) {
    return {
      selected,
      confirmSplit: {
        seatId,
        seatNumber: row!.seatNumber,
        partnerNumber: partner.seatNumber,
      },
    };
  }

  const next = new Set(selected);
  if (wasSelected) {
    next.delete(seatId);
    return { selected: next };
  }

  next.add(seatId);
  if (partner && isSelectable(partner)) next.add(partner.seatId);
  return { selected: next };
}

/** Typed seat numbers follow the same pairing rule as clicking. */
export function addSeats<T extends SelectableSeat>(
  seats: T[], selected: Set<string>, seatIds: string[],
): Set<string> {
  const next = new Set(selected);
  for (const id of seatIds) {
    const row = seats.find((s) => s.seatId === id);
    if (!isSelectable(row)) continue;
    next.add(id);
    const partner = partnerOf(seats, row!);
    if (partner && isSelectable(partner)) next.add(partner.seatId);
  }
  return next;
}

export function removeSeat(selected: Set<string>, seatId: string): Set<string> {
  const next = new Set(selected);
  next.delete(seatId);
  return next;
}
