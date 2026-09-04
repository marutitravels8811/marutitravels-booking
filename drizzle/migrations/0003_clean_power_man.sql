ALTER TABLE "booking_seat" ADD COLUMN "extra_person_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "booking_seat" SET "extra_person_count" = CASE WHEN "extra_person" THEN 1 ELSE 0 END
WHERE "extra_person_count" = 0;--> statement-breakpoint
ALTER TABLE "booking_seat" ADD CONSTRAINT "booking_seat_extra_person_count_nonnegative" CHECK ("booking_seat"."extra_person_count" >= 0);