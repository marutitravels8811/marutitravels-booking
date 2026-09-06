CREATE TABLE IF NOT EXISTS "office_setting" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "address" text,
  "phone" text,
  "alt_address" text,
  "alt_phone" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'office_setting_updated_by_agent_id_fk'
  ) THEN
    ALTER TABLE "office_setting"
      ADD CONSTRAINT "office_setting_updated_by_agent_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."agent"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
