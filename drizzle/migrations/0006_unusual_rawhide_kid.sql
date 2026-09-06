CREATE TYPE "public"."cleanup_frequency" AS ENUM('DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TABLE "data_retention_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 60 NOT NULL,
	"frequency" "cleanup_frequency" DEFAULT 'DAILY' NOT NULL,
	"delete_bookings" boolean DEFAULT true NOT NULL,
	"delete_expired_holds" boolean DEFAULT true NOT NULL,
	"delete_completed_trips" boolean DEFAULT false NOT NULL,
	"delete_idempotency_keys" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "audit_log" CASCADE;--> statement-breakpoint
ALTER TABLE "data_retention_setting" ADD CONSTRAINT "data_retention_setting_updated_by_agent_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;