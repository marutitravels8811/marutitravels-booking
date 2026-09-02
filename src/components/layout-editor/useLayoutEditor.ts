"use client";

import { useCallback, useMemo, useReducer } from "react";
import {
  type DraftLayout, type DraftSeat, type Deck, type BerthType,
  generateStandardLayout, validateLayout, summariseLayout, newKey,
} from "@/lib/seat-layout";

type Action =
  | { type: "RESET"; layout: DraftLayout }
  | { type: "ADD_SINGLE"; deck: Deck; row: number; col: number; berthType: BerthType }
  | { type: "ADD_DOUBLE"; deck: Deck; row: number; col: number }
  | { type: "REMOVE"; keys: string[] }
  | { type: "RENUMBER"; key: string; seatNumber: string }
  | { type: "SET_TYPE"; key: string; berthType: BerthType }
  | { type: "TOGGLE_ACTIVE"; key: string }
  | { type: "MOVE"; key: string; deck: Deck; row: number; col: number }
  | { type: "SET_META"; patch: Partial<Omit<DraftLayout, "seats">> }
  | { type: "AUTO_NUMBER"; scheme: "PER_DECK" | "SEQUENTIAL" };

function occupied(seats: DraftSeat[], deck: Deck, row: number, col: number, ignore?: string) {
  return seats.some(
    (s) => s.deck === deck && s.rowIndex === row && s.colIndex === col && s.key !== ignore,
  );
}

function nextNumberFor(seats: DraftSeat[], deck: Deck): string {
  const prefix = deck === "UPPER" ? "U" : deck === "LOWER" ? "L" : "C";
  const used = new Set(seats.map((s) => s.seatNumber.toUpperCase()));
  for (let i = 1; i < 200; i++) {
    const candidate = `${prefix}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}${seats.length + 1}`;
}

function reducer(state: DraftLayout, action: Action): DraftLayout {
  switch (action.type) {
    case "RESET":
      return action.layout;

    case "SET_META":
      return { ...state, ...action.patch };

    case "ADD_SINGLE": {
      const { deck, row, col, berthType } = action;
      if (occupied(state.seats, deck, row, col)) return state;
      const seat: DraftSeat = {
        key: newKey("s"),
        seatNumber: nextNumberFor(state.seats, deck),
        deck, berthType,
        sofaGroupKey: null, sofaPosition: null,
        rowIndex: row, colIndex: col,
        sortOrder: state.seats.length, isActive: true,
      };
      return { ...state, seats: [...state.seats, seat] };
    }

    case "ADD_DOUBLE": {
      const { deck, row, col } = action;
      // a double needs this cell and the one to its right; fall back to the left
      let a = col, b = col + 1;
      if (b >= state.sleeperCols || occupied(state.seats, deck, row, b)) {
        a = col - 1; b = col;
      }
      if (a < 0 || occupied(state.seats, deck, row, a) || occupied(state.seats, deck, row, b)) {
        return state;
      }
      const g = newKey("sofa");
      const base = { deck, berthType: "SLEEPER_DOUBLE" as const, sofaGroupKey: g, rowIndex: row, isActive: true };
      const seatA: DraftSeat = {
        ...base, key: newKey("s"), sofaPosition: "A", colIndex: a,
        seatNumber: nextNumberFor(state.seats, deck), sortOrder: state.seats.length,
      };
      const seatB: DraftSeat = {
        ...base, key: newKey("s"), sofaPosition: "B", colIndex: b,
        seatNumber: nextNumberFor([...state.seats, seatA], deck), sortOrder: state.seats.length + 1,
      };
      return { ...state, seats: [...state.seats, seatA, seatB] };
    }

    case "REMOVE": {
      const remove = new Set(action.keys);
      // removing half a double sofa removes its partner too
      const groups = new Set(
        state.seats.filter((s) => remove.has(s.key) && s.sofaGroupKey).map((s) => s.sofaGroupKey!),
      );
      return {
        ...state,
        seats: state.seats.filter(
          (s) => !remove.has(s.key) && !(s.sofaGroupKey && groups.has(s.sofaGroupKey)),
        ),
      };
    }

    case "RENUMBER":
      return {
        ...state,
        seats: state.seats.map((s) =>
          s.key === action.key ? { ...s, seatNumber: action.seatNumber } : s),
      };

    case "SET_TYPE": {
      const target = state.seats.find((s) => s.key === action.key);
      if (!target) return state;

      // leaving DOUBLE: drop the partner, since a sofa cannot be half a sofa
      if (target.berthType === "SLEEPER_DOUBLE" && action.berthType !== "SLEEPER_DOUBLE") {
        return {
          ...state,
          seats: state.seats
            .filter((s) => !(s.sofaGroupKey === target.sofaGroupKey && s.key !== target.key))
            .map((s) => s.key === action.key
              ? { ...s, berthType: action.berthType, sofaGroupKey: null, sofaPosition: null }
              : s),
        };
      }

      // entering DOUBLE: pair with a free neighbouring cell
      if (target.berthType !== "SLEEPER_DOUBLE" && action.berthType === "SLEEPER_DOUBLE") {
        const neighbour = [target.colIndex + 1, target.colIndex - 1].find(
          (c) => c >= 0 && c < state.sleeperCols &&
            !occupied(state.seats, target.deck, target.rowIndex, c),
        );
        if (neighbour === undefined) return state; // caller surfaces "no room"
        const g = newKey("sofa");
        const partner: DraftSeat = {
          key: newKey("s"),
          seatNumber: nextNumberFor(state.seats, target.deck),
          deck: target.deck, berthType: "SLEEPER_DOUBLE",
          sofaGroupKey: g, sofaPosition: neighbour > target.colIndex ? "B" : "A",
          rowIndex: target.rowIndex, colIndex: neighbour,
          sortOrder: state.seats.length, isActive: true,
        };
        return {
          ...state,
          seats: [
            ...state.seats.map((s) => s.key === action.key
              ? { ...s, berthType: action.berthType, sofaGroupKey: g,
                  sofaPosition: (neighbour > target.colIndex ? "A" : "B") as "A" | "B" }
              : s),
            partner,
          ],
        };
      }

      return {
        ...state,
        seats: state.seats.map((s) =>
          s.key === action.key ? { ...s, berthType: action.berthType } : s),
      };
    }

    case "TOGGLE_ACTIVE":
      return {
        ...state,
        seats: state.seats.map((s) =>
          s.key === action.key ? { ...s, isActive: !s.isActive } : s),
      };

    case "MOVE": {
      const { key, deck, row, col } = action;
      const target = state.seats.find((s) => s.key === key);
      if (!target || occupied(state.seats, deck, row, col, key)) return state;

      // a double sofa moves as one unit
      if (target.sofaGroupKey) {
        const partner = state.seats.find(
          (s) => s.sofaGroupKey === target.sofaGroupKey && s.key !== key);
        if (partner) {
          const dCol = col - target.colIndex;
          const pCol = partner.colIndex + dCol;
          if (pCol < 0 || pCol >= state.sleeperCols ||
              occupied(state.seats, deck, row, pCol, partner.key)) {
            return state;
          }
          return {
            ...state,
            seats: state.seats.map((s) =>
              s.key === key ? { ...s, deck, rowIndex: row, colIndex: col }
              : s.key === partner.key ? { ...s, deck, rowIndex: row, colIndex: pCol }
              : s),
          };
        }
      }
      return {
        ...state,
        seats: state.seats.map((s) =>
          s.key === key ? { ...s, deck, rowIndex: row, colIndex: col } : s),
      };
    }

    case "AUTO_NUMBER": {
      const ordered = [...state.seats].sort((a, b) => {
        const deckRank = (d: Deck) => (d === "CABIN" ? 0 : d === "LOWER" ? 1 : 2);
        return deckRank(a.deck) - deckRank(b.deck)
          || a.rowIndex - b.rowIndex
          || a.colIndex - b.colIndex;
      });
      let seq = 0;
      const perDeck: Record<string, number> = { UPPER: 0, LOWER: 0, CABIN: 0 };
      const renumbered = new Map<string, string>();
      for (const s of ordered) {
        if (action.scheme === "SEQUENTIAL") {
          seq += 1;
          renumbered.set(s.key, String(seq));
        } else {
          perDeck[s.deck] += 1;
          const p = s.deck === "UPPER" ? "U" : s.deck === "LOWER" ? "L" : "C";
          renumbered.set(s.key, `${p}${perDeck[s.deck]}`);
        }
      }
      return {
        ...state,
        seats: state.seats.map((s) => ({
          ...s, seatNumber: renumbered.get(s.key) ?? s.seatNumber,
        })),
      };
    }
  }
}

export function useLayoutEditor(initial?: DraftLayout) {
  const [layout, dispatch] = useReducer(
    reducer, initial ?? generateStandardLayout(),
  );

  const issues = useMemo(() => validateLayout(layout), [layout]);
  const summary = useMemo(() => summariseLayout(layout), [layout]);
  const isValid = issues.every((i) => i.level !== "error");

  const loadStandard = useCallback(() => {
    dispatch({ type: "RESET", layout: generateStandardLayout() });
  }, []);

  return { layout, dispatch, issues, summary, isValid, loadStandard };
}
