import { z } from "zod";

export const deckSchema = z.enum(["UPPER", "LOWER", "CABIN"]);
export const berthTypeSchema = z.enum(["SLEEPER_SINGLE", "SLEEPER_DOUBLE", "CABIN"]);

export const draftSeatSchema = z.object({
  key: z.string().min(1),
  seatNumber: z.string().trim().min(1, "Seat number is required").max(10),
  deck: deckSchema,
  berthType: berthTypeSchema,
  sofaGroupKey: z.string().nullable(),
  sofaPosition: z.enum(["A", "B"]).nullable(),
  rowIndex: z.number().int().min(0).max(50),
  colIndex: z.number().int().min(0).max(20),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export const draftLayoutSchema = z.object({
  name: z.string().trim().min(1).max(120),
  doubleSofaPolicy: z.enum(["INDEPENDENT", "PAIRED", "SOFT_PAIR"]),
  sleeperRows: z.number().int().min(1).max(20),
  sleeperCols: z.number().int().min(1).max(10),
  cabinRows: z.number().int().min(0).max(5),
  cabinCols: z.number().int().min(0).max(12),
  seats: z.array(draftSeatSchema).min(1, "A layout needs at least one berth"),
});

/** Rupees in the form, paise in the database. Never a float in between. */
const rupeeField = z.union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "") || 0) : v;
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  })
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid amount")
  .refine((n) => n <= 100_000_00, "That looks too large");

export const busFormSchema = z.object({
  id: z.string().uuid().optional(),
  registrationNo: z.string().trim().min(4, "Registration number looks too short").max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
  displayName: z.string().trim().min(1, "Give the bus a name").max(80),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  fareSingleSofa: rupeeField,
  fareDoubleSofa: rupeeField,
  fareCabin: rupeeField,
  layout: draftLayoutSchema,
});

export type BusFormInput = z.input<typeof busFormSchema>;
export type BusFormValues = z.output<typeof busFormSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/* ─────────────────────────── routes ─────────────────────────── */

export const boardingPointSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name the stop").max(120),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  kind: z.enum(["BOARDING", "DROPPING"]),
  sequence: z.number().int().min(0).max(999),
  offsetMinutes: z.number().int().min(-1440).max(1440),
});

export const routeFormSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2, "Give the route a short code").max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "-")),
  origin: z.string().trim().min(1, "Where does it start?").max(80),
  destination: z.string().trim().min(1, "Where does it end?").max(80),
  distanceKm: z.number().int().min(0).max(5000).nullable().optional(),
  defaultDurationMin: z.number().int().min(0).max(6000).nullable().optional(),
  isActive: z.boolean().default(true),
  points: z.array(boardingPointSchema).max(60),
});

/* ─────────────────────────── trips ─────────────────────────── */

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 21:00");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-02");

export const adHocTripSchema = z.object({
  routeId: z.string().uuid("Choose a route"),
  busId: z.string().uuid("Choose a bus"),
  direction: z.enum(["ONWARD", "RETURN"]),
  serviceDate: isoDate,
  departureTime: timeHHMM,
  arrivalTime: timeHHMM,
});

export const scheduleTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid("Choose a route"),
  busId: z.string().uuid("Choose a bus"),
  direction: z.enum(["ONWARD", "RETURN"]),
  departureTime: timeHHMM,
  arrivalTime: timeHHMM,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  validFrom: isoDate,
  validTo: isoDate.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const generateTripsSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  templateIds: z.array(z.string().uuid()).optional(),
}).refine((v) => v.fromDate <= v.toDate, {
  message: "The end date must not be before the start date", path: ["toDate"],
});

/* ────────────────────────── booking ────────────────────────── */

export const paymentTypeSchema = z.enum(["CASH", "ONLINE", "PENDING"]);

export const holdSeatsSchema = z.object({
  tripId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1, "Select at least one seat"),
  /** optional hint so a parked reservation is recognisable in the tray */
  provisionalName: z.string().trim().max(120).optional().or(z.literal("")),
  provisionalPhone: z.string().trim().max(20).optional().or(z.literal("")),
});

export const confirmBookingSchema = z.object({
  holdId: z.string().uuid(),
  customerName: z.string().trim().min(1, "Enter the customer's name").max(120),
  customerPhone: z.string().trim()
    .min(6, "Enter a valid phone number").max(20)
    .regex(/^[\d+\-() ]+$/, "Phone number can only contain digits and + - ( )"),
  altPhone: z.string().trim().max(20).optional().or(z.literal("")),
  boardingPointId: z.string().uuid().nullable().optional(),
  boardingName: z.string().trim().max(160).optional().or(z.literal("")),
  droppingPointId: z.string().uuid().nullable().optional(),
  droppingName: z.string().trim().max(160).optional().or(z.literal("")),
  paymentType: paymentTypeSchema,
  amountPaid: rupeeField.optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  seats: z.array(z.object({
    seatId: z.string().uuid(),
    passengerName: z.string().trim().max(120).optional().or(z.literal("")),
    age: z.number().int().min(0).max(120).nullable().optional(),
    gender: z.enum(["M", "F", "O"]).nullable().optional(),
    fare: rupeeField,
  })).min(1),
});
