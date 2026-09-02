/**
 * Seat layout model and the standard-bus generator.
 *
 * The physical bus this was built for:
 *
 *   CABIN   5 seats, their own zone
 *   Rows 1-5 (per deck)  1 single sofa + 1 double sofa
 *   Row 6    (per deck)  2 double sofas across the full width (back row)
 *
 *   per deck : 5 singles + (5 + 2) doubles = 5 + 14 = 19 berths
 *   two decks: 10 singles + 14 doubles     = 10 + 28 = 38 sleeper berths
 *   plus cabin                             = 43 sellable berths
 *
 * Nothing here is hard-coded into the booking logic — this generator only
 * seeds a starting point. Every berth's number, type, deck and grid position
 * stays editable in the layout editor.
 */

export type Deck = "UPPER" | "LOWER" | "CABIN";
export type BerthType = "SLEEPER_SINGLE" | "SLEEPER_DOUBLE" | "CABIN";
export type SofaPosition = "A" | "B";

export interface DraftSeat {
  /** stable client-side key; becomes the DB uuid on save */
  key: string;
  seatNumber: string;
  deck: Deck;
  berthType: BerthType;
  /** both berths of one double sofa share this */
  sofaGroupKey: string | null;
  sofaPosition: SofaPosition | null;
  rowIndex: number;
  colIndex: number;
  sortOrder: number;
  isActive: boolean;
}

export interface DraftLayout {
  name: string;
  doubleSofaPolicy: "INDEPENDENT" | "PAIRED" | "SOFT_PAIR";
  sleeperRows: number;
  sleeperCols: number;
  cabinRows: number;
  cabinCols: number;
  seats: DraftSeat[];
}

/* ─────────────────────── grid conventions ─────────────────────── */

/**
 * Sleeper decks use a 4-column grid:
 *
 *        col 0        col 1      col 2     col 3
 *   r1 [ single  ] [  aisle  ] [ dblA  ] [ dblB  ]
 *   ...
 *   r5 [ single  ] [  aisle  ] [ dblA  ] [ dblB  ]
 *   r6 [ dblA    ] [  dblB   ] [ dblA  ] [ dblB  ]   <- back row, no aisle
 *
 * The cabin zone is a separate 1 x 5 grid.
 */
export const SLEEPER_COLS = 4;
export const AISLE_COL = 1;
export const BACK_ROW_INDEX = 5; // zero-based: the 6th row

export function isAisleCell(rowIndex: number, colIndex: number): boolean {
  return colIndex === AISLE_COL && rowIndex !== BACK_ROW_INDEX;
}

let keyCounter = 0;
export function newKey(prefix = "s"): string {
  keyCounter += 1;
  return `${prefix}_${keyCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ─────────────────────── the generator ─────────────────────── */

export interface StandardLayoutOptions {
  name?: string;
  sleeperRows?: number;
  /** how many of the leading rows carry 1 single + 1 double */
  mixedRows?: number;
  cabinCount?: number;
  /** "U1"/"L1"/"C1" style, or a single running 1..43 sequence */
  numbering?: "PER_DECK" | "SEQUENTIAL";
  upperPrefix?: string;
  lowerPrefix?: string;
  cabinPrefix?: string;
}

export function generateStandardLayout(
  opts: StandardLayoutOptions = {},
): DraftLayout {
  const {
    name = "Standard 38 Sleeper + 5 Cabin",
    sleeperRows = 6,
    mixedRows = 5,
    cabinCount = 5,
    numbering = "PER_DECK",
    upperPrefix = "U",
    lowerPrefix = "L",
    cabinPrefix = "C",
  } = opts;

  const seats: DraftSeat[] = [];
  let sequential = 0;

  const label = (deck: Deck, perDeckIndex: number): string => {
    if (numbering === "SEQUENTIAL") {
      sequential += 1;
      return String(sequential);
    }
    const prefix =
      deck === "UPPER" ? upperPrefix : deck === "LOWER" ? lowerPrefix : cabinPrefix;
    return `${prefix}${perDeckIndex}`;
  };

  /* cabin first — it sits at the front of the bus and of the ticket */
  for (let c = 0; c < cabinCount; c++) {
    seats.push({
      key: newKey("cab"),
      seatNumber: label("CABIN", c + 1),
      deck: "CABIN",
      berthType: "CABIN",
      sofaGroupKey: null,
      sofaPosition: null,
      rowIndex: 0,
      colIndex: c,
      sortOrder: seats.length,
      isActive: true,
    });
  }

  for (const deck of ["LOWER", "UPPER"] as const) {
    let n = 0;
    const push = (s: Omit<DraftSeat, "seatNumber" | "sortOrder" | "key">) => {
      n += 1;
      seats.push({
        ...s,
        key: newKey(deck.toLowerCase()),
        seatNumber: label(deck, n),
        sortOrder: seats.length,
      });
    };

    for (let r = 0; r < sleeperRows; r++) {
      if (r < mixedRows) {
        /* 1 single at col 0, aisle at col 1, 1 double at cols 2-3 */
        push({
          deck, berthType: "SLEEPER_SINGLE", sofaGroupKey: null,
          sofaPosition: null, rowIndex: r, colIndex: 0, isActive: true,
        });
        const g = newKey("sofa");
        push({
          deck, berthType: "SLEEPER_DOUBLE", sofaGroupKey: g,
          sofaPosition: "A", rowIndex: r, colIndex: 2, isActive: true,
        });
        push({
          deck, berthType: "SLEEPER_DOUBLE", sofaGroupKey: g,
          sofaPosition: "B", rowIndex: r, colIndex: 3, isActive: true,
        });
      } else {
        /* back row: 2 doubles filling all 4 columns */
        for (const startCol of [0, 2]) {
          const g = newKey("sofa");
          push({
            deck, berthType: "SLEEPER_DOUBLE", sofaGroupKey: g,
            sofaPosition: "A", rowIndex: r, colIndex: startCol, isActive: true,
          });
          push({
            deck, berthType: "SLEEPER_DOUBLE", sofaGroupKey: g,
            sofaPosition: "B", rowIndex: r, colIndex: startCol + 1, isActive: true,
          });
        }
      }
    }
  }

  return {
    name,
    doubleSofaPolicy: "INDEPENDENT",
    sleeperRows,
    sleeperCols: SLEEPER_COLS,
    cabinRows: 1,
    cabinCols: Math.max(cabinCount, 1),
    seats,
  };
}

/* ─────────────────────── validation ─────────────────────── */

export interface LayoutIssue {
  level: "error" | "warning";
  message: string;
  seatKeys?: string[];
}

export function validateLayout(layout: DraftLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const active = layout.seats.filter((s) => s.isActive);

  /* duplicate seat numbers */
  const byNumber = new Map<string, DraftSeat[]>();
  for (const s of active) {
    const n = s.seatNumber.trim().toUpperCase();
    if (!n) {
      issues.push({ level: "error", message: "A berth has a blank number.", seatKeys: [s.key] });
      continue;
    }
    byNumber.set(n, [...(byNumber.get(n) ?? []), s]);
  }
  for (const [n, group] of byNumber) {
    if (group.length > 1) {
      issues.push({
        level: "error",
        message: `Seat number "${n}" is used ${group.length} times. Numbers must be unique.`,
        seatKeys: group.map((s) => s.key),
      });
    }
  }

  /* two berths in one cell */
  const byCell = new Map<string, DraftSeat[]>();
  for (const s of active) {
    const k = `${s.deck}:${s.rowIndex}:${s.colIndex}`;
    byCell.set(k, [...(byCell.get(k) ?? []), s]);
  }
  for (const [k, group] of byCell) {
    if (group.length > 1) {
      issues.push({
        level: "error",
        message: `Two berths occupy the same position (${k.replace(/:/g, " row ")}).`,
        seatKeys: group.map((s) => s.key),
      });
    }
  }

  /* double sofas must have exactly two members, A and B */
  const byGroup = new Map<string, DraftSeat[]>();
  for (const s of active) {
    if (s.berthType === "SLEEPER_DOUBLE") {
      if (!s.sofaGroupKey) {
        issues.push({
          level: "error",
          message: `Double sofa berth "${s.seatNumber}" is not paired with a partner berth.`,
          seatKeys: [s.key],
        });
        continue;
      }
      byGroup.set(s.sofaGroupKey, [...(byGroup.get(s.sofaGroupKey) ?? []), s]);
    }
  }
  for (const [, group] of byGroup) {
    if (group.length !== 2) {
      issues.push({
        level: "error",
        message: `A double sofa has ${group.length} berth(s); it must have exactly 2.`,
        seatKeys: group.map((s) => s.key),
      });
      continue;
    }
    const positions = group.map((s) => s.sofaPosition).sort().join("");
    if (positions !== "AB") {
      issues.push({
        level: "error",
        message: `Double sofa "${group.map((s) => s.seatNumber).join("/")}" must have one A berth and one B berth.`,
        seatKeys: group.map((s) => s.key),
      });
    }
    if (group[0].deck !== group[1].deck) {
      issues.push({
        level: "error",
        message: `Double sofa "${group.map((s) => s.seatNumber).join("/")}" spans two decks.`,
        seatKeys: group.map((s) => s.key),
      });
    }
  }

  if (active.length === 0) {
    issues.push({ level: "error", message: "The layout has no active berths." });
  }
  return issues;
}

/* ─────────────────────── summary ─────────────────────── */

export interface LayoutSummary {
  totalBerths: number;
  doubleSofas: number;
  singleSofas: number;
  cabinSeats: number;
  sleeperBerths: number;
  perDeck: Record<Deck, number>;
}

export function summariseLayout(layout: DraftLayout): LayoutSummary {
  const active = layout.seats.filter((s) => s.isActive);
  const doubleGroups = new Set(
    active.filter((s) => s.berthType === "SLEEPER_DOUBLE" && s.sofaGroupKey)
      .map((s) => s.sofaGroupKey!),
  );
  const singles = active.filter((s) => s.berthType === "SLEEPER_SINGLE").length;
  const cabin = active.filter((s) => s.berthType === "CABIN").length;
  return {
    totalBerths: active.length,
    doubleSofas: doubleGroups.size,
    singleSofas: singles,
    cabinSeats: cabin,
    sleeperBerths: active.length - cabin,
    perDeck: {
      UPPER: active.filter((s) => s.deck === "UPPER").length,
      LOWER: active.filter((s) => s.deck === "LOWER").length,
      CABIN: cabin,
    },
  };
}
