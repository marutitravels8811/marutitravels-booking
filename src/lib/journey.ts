/**
 * Which way a bus is actually travelling.
 *
 * A route is stored once, in one direction: Rajkot → Mumbai. The return leg
 * reuses that row with `direction = RETURN`, so anything showing the route's
 * origin and destination verbatim describes the return trip backwards. Every
 * place that displays a journey goes through here instead, so the rule is
 * defined once and cannot drift between the screen and the printed ticket.
 */

export type Direction = "ONWARD" | "RETURN";

export interface Journey {
  from: string;
  to: string;
}

export function journeyOf(
  origin: string, destination: string, direction: Direction,
): Journey {
  return direction === "RETURN"
    ? { from: destination, to: origin }
    : { from: origin, to: destination };
}

export function journeyLabel(
  origin: string, destination: string, direction: Direction,
): string {
  const j = journeyOf(origin, destination, direction);
  return `${j.from} → ${j.to}`;
}

/**
 * Which of the route's stop lists to offer as pickup and as drop.
 *
 * A route's BOARDING points sit at its origin end and its DROPPING points at
 * the destination end. On the return leg the bus starts from the destination
 * end, so the two lists swap — otherwise the counter would be offering Rajkot
 * pickups for a bus leaving Mumbai.
 */
export function pointKindsFor(direction: Direction): {
  pickup: "BOARDING" | "DROPPING";
  drop: "BOARDING" | "DROPPING";
} {
  return direction === "RETURN"
    ? { pickup: "DROPPING", drop: "BOARDING" }
    : { pickup: "BOARDING", drop: "DROPPING" };
}

/** "Onward" / "Return", for the badge. */
export function directionLabel(direction: Direction): string {
  return direction === "RETURN" ? "Return" : "Onward";
}
