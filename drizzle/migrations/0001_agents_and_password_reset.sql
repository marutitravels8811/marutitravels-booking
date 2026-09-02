CREATE TYPE "public"."password_reset_status" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "password_reset_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_approved_by_agent_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_agent_idx" ON "password_reset" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "password_reset_status_idx" ON "password_reset" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_pending_uq" ON "password_reset" USING btree ("agent_id") WHERE "password_reset"."status" = 'PENDING';