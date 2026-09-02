/**
 * Which way the bus is going.
 *
 * A route is stored once (Rajkot → Mumbai) and the return leg reuses that row,
 * so anything printing the route verbatim describes the return trip backwards.
 */
import {
  journeyOf, journeyLabel, pointKindsFor, directionLabel,
} from "../../src/lib/journey";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\x1b[1mEndpoints\x1b[0m");
check("onward reads as stored",
  journeyLabel("Rajkot", "Mumbai", "ONWARD") === "Rajkot → Mumbai",
  journeyLabel("Rajkot", "Mumbai", "ONWARD"));
check("return is swapped, not repeated",
  journeyLabel("Rajkot", "Mumbai", "RETURN") === "Mumbai → Rajkot",
  journeyLabel("Rajkot", "Mumbai", "RETURN"));
check("the two legs are never identical",
  journeyLabel("Rajkot", "Mumbai", "ONWARD") !== journeyLabel("Rajkot", "Mumbai", "RETURN"));

const back = journeyOf("Rajkot", "Mumbai", "RETURN");
check("return departs from the route's destination", back.from === "Mumbai", back.from);
check("and arrives at its origin", back.to === "Rajkot", back.to);

console.log("\n\x1b[1mStops follow the direction\x1b[0m");
const on = pointKindsFor("ONWARD");
check("onward picks up at the boarding points",
  on.pickup === "BOARDING" && on.drop === "DROPPING");
const ret = pointKindsFor("RETURN");
check("return picks up where the onward leg dropped off",
  ret.pickup === "DROPPING" && ret.drop === "BOARDING");
check("pickup and drop are never the same list",
  on.pickup !== on.drop && ret.pickup !== ret.drop);

console.log("\n\x1b[1mLabels\x1b[0m");
check("onward badge", directionLabel("ONWARD") === "Onward");
check("return badge", directionLabel("RETURN") === "Return");

console.log("\n\x1b[1mA round trip is symmetric\x1b[0m");
const there = journeyOf("Rajkot", "Mumbai", "ONWARD");
const backAgain = journeyOf("Rajkot", "Mumbai", "RETURN");
check("you come back to where you started",
  there.from === backAgain.to && there.to === backAgain.from);

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
