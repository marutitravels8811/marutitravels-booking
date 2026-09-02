import type { BerthType } from "./seat-layout";

export interface BusFares {
  fareSingleSofaPaise: number;
  fareDoubleSofaPaise: number;
  fareCabinPaise: number;
}

/**
 * The default price for a berth, taken from the bus it belongs to.
 *
 * This is only ever a *starting* value: the agent can change the amount on any
 * booking, and the price actually charged is stored on `booking_seat.fare_paise`
 * so a later change to the bus's defaults cannot rewrite history.
 */
export function defaultFareFor(berthType: BerthType, fares: BusFares): number {
  switch (berthType) {
    case "SLEEPER_SINGLE": return fares.fareSingleSofaPaise;
    case "SLEEPER_DOUBLE": return fares.fareDoubleSofaPaise;
    case "CABIN":          return fares.fareCabinPaise;
  }
}

export function sumFares(seats: { farePaise: number }[]): number {
  return seats.reduce((t, s) => t + s.farePaise, 0);
}
