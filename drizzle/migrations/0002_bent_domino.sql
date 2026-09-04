ALTER TABLE "booking_seat" ADD COLUMN "extra_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_seat" ADD COLUMN "extra_person_charge_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bus" ADD COLUMN "extra_person_single_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bus" ADD COLUMN "extra_person_double_paise" bigint DEFAULT 0 NOT NULL;