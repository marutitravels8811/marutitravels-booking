import type { DraftSeat, Deck } from "@/lib/seat-layout";

export interface SeatCell<T extends { rowIndex: number; colIndex: number }> {
  seat: T | null;
  rowIndex: number;
  colIndex: number;
  isAisle: boolean;
}

/**
 * Turn a flat seat list into the grid the deck is drawn on.
 *
 * A cell is an aisle when it is empty *and* every other row places a berth in
 * that column — which is exactly the gangway. Deriving it rather than
 * hard-coding column 1 keeps custom layouts drawing correctly.
 */
export function buildGrid<T extends DraftSeat | SeatLike>(
  seats: T[],
  deck: Deck,
  rows: number,
  cols: number,
): SeatCell<T>[][] {
  const inDeck = seats.filter((s) => s.deck === deck);
  const at = new Map<string, T>();
  for (const s of inDeck) at.set(`${s.rowIndex}:${s.colIndex}`, s);

  const occupiedRowsPerCol = new Array(cols).fill(0);
  for (const s of inDeck) {
    if (s.colIndex < cols) occupiedRowsPerCol[s.colIndex] += 1;
  }
  const maxOccupancy = Math.max(1, ...occupiedRowsPerCol);

  const grid: SeatCell<T>[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: SeatCell<T>[] = [];
    for (let c = 0; c < cols; c++) {
      const seat = at.get(`${r}:${c}`) ?? null;
      // a gangway column carries far fewer berths than the busiest column
      const isAisle = !seat && occupiedRowsPerCol[c] < maxOccupancy;
      row.push({ seat, rowIndex: r, colIndex: c, isAisle });
    }
    grid.push(row);
  }
  return grid;
}

export interface SeatLike {
  id?: string;
  key?: string;
  seatNumber: string;
  deck: Deck;
  berthType: "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
  sofaGroupKey?: string | null;
  sofaGroupId?: string | null;
  sofaPosition: "A" | "B" | null;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
}

export function groupKeyOf(s: SeatLike | DraftSeat): string | null {
  return (
    (s as SeatLike).sofaGroupKey ??
    (s as SeatLike).sofaGroupId ??
    null
  );
}
