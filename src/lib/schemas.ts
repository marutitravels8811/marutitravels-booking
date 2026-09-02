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

export const busFormSchema = z.object({
  id: z.string().uuid().optional(),
  registrationNo: z.string().trim().min(4, "Registration number looks too short").max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
  displayName: z.string().trim().min(1, "Give the bus a name").max(80),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  layout: draftLayoutSchema,
});

export type BusFormInput = z.input<typeof busFormSchema>;
export type BusFormValues = z.output<typeof busFormSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
