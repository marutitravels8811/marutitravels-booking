"use client";

import { cn } from "@/lib/utils";
import type { Deck } from "@/lib/seat-layout";
import { buildGrid, groupKeyOf, type SeatLike } from "./geometry";

export type SeatVisualState =
  | "AVAILABLE" | "SELECTED" | "HELD_BY_ME" | "HELD_BY_OTHER"
  | "BOOKED" | "BLOCKED" | "EMPTY";

const STATE_CLASS: Record<Exclude<SeatVisualState, "EMPTY">, string> = {
  AVAILABLE: "seat-available",
  SELECTED: "seat-selected",
  HELD_BY_ME: "seat-held-me",
  HELD_BY_OTHER: "seat-held-other",
  BOOKED: "seat-booked",
  BLOCKED: "seat-blocked",
};

export interface SeatMapProps<T extends SeatLike> {
  seats: T[];
  sleeperRows: number;
  sleeperCols: number;
  cabinCols: number;
  /** per-seat visual state; defaults to AVAILABLE */
  stateOf?: (seat: T) => SeatVisualState;
  /** tooltip / aria description, e.g. "Held by Ramesh until 4:12 pm" */
  titleOf?: (seat: T) => string | undefined;
  onSeatClick?: (seat: T) => void;
  /** editor mode: clicking an empty cell adds a berth there */
  onEmptyCellClick?: (deck: Deck, rowIndex: number, colIndex: number) => void;
  disabledSeat?: (seat: T) => boolean;
  /** highlight ring, used by the editor for the current selection */
  highlightKeys?: Set<string>;
  compact?: boolean;
  showLegend?: boolean;
}

function keyOf(s: SeatLike): string {
  return s.id ?? s.key ?? `${s.deck}:${s.rowIndex}:${s.colIndex}`;
}

export function SeatMap<T extends SeatLike>({
  seats, sleeperRows, sleeperCols, cabinCols,
  stateOf, titleOf, onSeatClick, onEmptyCellClick, disabledSeat,
  highlightKeys, compact = false, showLegend = true,
}: SeatMapProps<T>) {
  const cabinSeats = seats.filter((s) => s.deck === "CABIN");

  return (
    <div className="flex flex-col gap-5">
      {cabinSeats.length > 0 && (
        <DeckPanel
          label="Cabin"
          sublabel={`${cabinSeats.filter((s) => s.isActive).length} seats`}
          seats={seats} deck="CABIN" rows={1} cols={Math.max(cabinCols, 1)}
          {...{ stateOf, titleOf, onSeatClick, onEmptyCellClick, disabledSeat, highlightKeys, compact }}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {(["LOWER", "UPPER"] as const).map((deck) => (
          <DeckPanel
            key={deck}
            label={deck === "LOWER" ? "Lower deck" : "Upper deck"}
            sublabel={`${seats.filter((s) => s.deck === deck && s.isActive).length} berths`}
            seats={seats} deck={deck} rows={sleeperRows} cols={sleeperCols}
            {...{ stateOf, titleOf, onSeatClick, onEmptyCellClick, disabledSeat, highlightKeys, compact }}
          />
        ))}
      </div>

      {showLegend && <Legend />}
    </div>
  );
}

function DeckPanel<T extends SeatLike>({
  label, sublabel, seats, deck, rows, cols,
  stateOf, titleOf, onSeatClick, onEmptyCellClick, disabledSeat,
  highlightKeys, compact,
}: {
  label: string; sublabel: string; seats: T[]; deck: Deck;
  rows: number; cols: number;
} & Pick<SeatMapProps<T>,
  "stateOf" | "titleOf" | "onSeatClick" | "onEmptyCellClick" | "disabledSeat" | "highlightKeys" | "compact">) {
  const grid = buildGrid(seats, deck, rows, cols);
  // 44px is the minimum comfortable touch target; the desktop size is larger
  const size = compact ? "h-10 sm:h-9" : "h-12";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink-800">{label}</h3>
        <span className="text-xs text-ink-500">{sublabel}</span>
      </header>

      {deck !== "CABIN" && (
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-ink-400">
          <span className="inline-block h-px flex-1 bg-[var(--border)]" />
          front
        </div>
      )}

      <div className="-mx-1 flex flex-col gap-1.5 overflow-x-auto px-1 pb-1">
        {grid.map((row, r) => (
          <div key={r} className="flex min-w-64 gap-1 sm:gap-1.5">
            {row.map((cell) => {
              if (!cell.seat) {
                if (cell.isAisle) {
                  return (
                    <div key={cell.colIndex}
                      className={cn("w-5 shrink-0 sm:w-7", size)}
                      aria-hidden />
                  );
                }
                return (
                  <button key={cell.colIndex} type="button"
                    onClick={() => onEmptyCellClick?.(deck, cell.rowIndex, cell.colIndex)}
                    disabled={!onEmptyCellClick}
                    aria-label={`Empty position, row ${r + 1}, column ${cell.colIndex + 1}`}
                    className={cn(
                      "flex-1 rounded-lg border border-dashed border-ink-200 text-ink-300",
                      size,
                      onEmptyCellClick
                        ? "cursor-pointer transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
                        : "cursor-default opacity-40",
                    )}>
                    {onEmptyCellClick ? <span className="text-lg leading-none">+</span> : null}
                  </button>
                );
              }

              const s = cell.seat;
              const state = stateOf?.(s) ?? "AVAILABLE";
              const disabled = disabledSeat?.(s) ?? false;
              const isDouble = s.berthType === "SLEEPER_DOUBLE";
              const g = groupKeyOf(s);
              const k = keyOf(s);

              return (
                <button
                  key={k} type="button"
                  onClick={() => !disabled && onSeatClick?.(s)}
                  disabled={disabled || !onSeatClick}
                  title={titleOf?.(s) ?? s.seatNumber}
                  aria-label={`Seat ${s.seatNumber}, ${labelForType(s.berthType)}, ${state.toLowerCase().replace(/_/g, " ")}`}
                  data-sofa-group={g ?? undefined}
                  className={cn(
                    "relative flex-1 rounded-lg border-2 text-xs font-semibold transition",
                    "flex flex-col items-center justify-center gap-0.5",
                    size,
                    STATE_CLASS[state === "EMPTY" ? "AVAILABLE" : state],
                    "border-[var(--sb)] bg-[var(--sc)] text-[var(--st)]",
                    !s.isActive && "opacity-40 grayscale",
                    highlightKeys?.has(k) && "ring-2 ring-brand-500 ring-offset-1",
                    disabled ? "cursor-not-allowed" : onSeatClick && "cursor-pointer hover:brightness-97",
                    // visually fuse the two halves of a double sofa
                    isDouble && s.sofaPosition === "A" && "rounded-r-sm",
                    isDouble && s.sofaPosition === "B" && "rounded-l-sm",
                  )}>
                  <span className="leading-none">{s.seatNumber}</span>
                  {state === "BOOKED" && s.customerName && (
                    <span className="max-w-full truncate px-1 text-[9px] font-medium leading-none opacity-80">
                      {s.customerName}
                    </span>
                  )}
                  {isDouble && s.sofaPosition === "A" && (
                    <span aria-hidden
                      className="absolute -right-[7px] top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[var(--sb)] bg-[var(--sc)]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function labelForType(t: SeatLike["berthType"]) {
  return t === "SLEEPER_DOUBLE" ? "double sofa"
    : t === "SLEEPER_SINGLE" ? "single sofa" : "cabin seat";
}

export function Legend() {
  const items: [SeatVisualState, string][] = [
    ["AVAILABLE", "Available"],
    ["SELECTED", "Selected"],
    ["HELD_BY_ME", "Held by you"],
    ["HELD_BY_OTHER", "Held by another agent"],
    ["BOOKED", "Booked"],
    ["BLOCKED", "Blocked"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs text-ink-600">
      {items.map(([state, label]) => (
        <span key={state} className="flex items-center gap-2">
          <span className={cn(
            "h-4 w-6 rounded border-2 border-[var(--sb)] bg-[var(--sc)]",
            STATE_CLASS[state as Exclude<SeatVisualState, "EMPTY">],
          )} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-2 text-ink-500 sm:ml-auto">
        <span className="inline-flex h-4 w-9 items-center">
          <span className="h-4 w-4 rounded-l border-2 border-ink-300 bg-white" />
          <span className="z-10 -mx-[5px] h-2.5 w-2.5 rounded-full border-2 border-ink-300 bg-white" />
          <span className="h-4 w-4 rounded-r border-2 border-ink-300 bg-white" />
        </span>
        joined = one double sofa
      </span>
    </div>
  );
}
