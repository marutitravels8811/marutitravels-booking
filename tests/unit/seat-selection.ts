/**
 * Double-sofa selection rules.
 *   pnpm test:unit
 */
import {
  toggleSeat, addSeats, removeSeat, partnerOf, type SelectableSeat,
} from "../../src/lib/seat-selection";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
};

const seat = (
  seatId: string, seatNumber: string, sofaGroupId: string | null,
  status: SelectableSeat["status"] = "AVAILABLE", isActive = true,
): SelectableSeat => ({ seatId, seatNumber, sofaGroupId, status, isActive });

// L2/L3 are one double sofa; L5/L6 another; L1 a single; L9 booked
const SEATS: SelectableSeat[] = [
  seat("1", "L1", null),
  seat("2", "L2", "sofa-a"),
  seat("3", "L3", "sofa-a"),
  seat("5", "L5", "sofa-b"),
  seat("6", "L6", "sofa-b"),
  seat("9", "L9", "sofa-c"),
  seat("10", "L10", "sofa-c", "BOOKED"),
];
const ids = (s: Set<string>) =>
  [...s].map((i) => SEATS.find((x) => x.seatId === i)!.seatNumber).sort().join(",");

console.log("\x1b[1mDouble sofa selection\x1b[0m");

const r1 = toggleSeat(SEATS, new Set(), "2");
check("clicking one half of a double selects both", ids(r1.selected) === "L2,L3", ids(r1.selected));
check("no confirmation needed to select", !r1.confirmSplit);

const r2 = toggleSeat(SEATS, new Set(), "1");
check("a single sofa selects alone", ids(r2.selected) === "L1", ids(r2.selected));

const r3 = toggleSeat(SEATS, r1.selected, "2");
check("removing a half while its partner is selected asks first", !!r3.confirmSplit);
check("the selection is untouched until confirmed", ids(r3.selected) === "L2,L3", ids(r3.selected));
check("the prompt names both berths",
  r3.confirmSplit?.seatNumber === "L2" && r3.confirmSplit?.partnerNumber === "L3",
  JSON.stringify(r3.confirmSplit));

const afterSplit = removeSeat(r1.selected, "2");
check("confirming leaves only the partner", ids(afterSplit) === "L3", ids(afterSplit));

const r4 = toggleSeat(SEATS, afterSplit, "3");
check("deselecting the last half needs no confirmation", !r4.confirmSplit);
check("and clears the sofa", ids(r4.selected) === "", ids(r4.selected));

const r5 = toggleSeat(SEATS, new Set(), "9");
check("a double whose partner is booked selects alone", ids(r5.selected) === "L9", ids(r5.selected));

const r6 = toggleSeat(SEATS, new Set(), "10");
check("a booked berth cannot be selected", ids(r6.selected) === "", ids(r6.selected));

console.log("\n\x1b[1mTyped seat numbers\x1b[0m");

const t1 = addSeats(SEATS, new Set(), ["2"]);
check("typing one half of a double takes both", ids(t1) === "L2,L3", ids(t1));

const t2 = addSeats(SEATS, new Set(), ["2", "3"]);
check("typing both halves is not doubled up", ids(t2) === "L2,L3", ids(t2));

const t3 = addSeats(SEATS, new Set(), ["1", "5"]);
check("mixed single and double resolves correctly", ids(t3) === "L1,L5,L6", ids(t3));

const t4 = addSeats(SEATS, new Set(["1"]), ["10"]);
check("a booked berth is ignored, selection preserved", ids(t4) === "L1", ids(t4));

console.log("\n\x1b[1mPairing\x1b[0m");
check("partnerOf finds the other half",
  partnerOf(SEATS, SEATS[1])?.seatNumber === "L3");
check("a single sofa has no partner", partnerOf(SEATS, SEATS[0]) === null);

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
