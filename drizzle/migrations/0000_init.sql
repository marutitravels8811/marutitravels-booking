CREATE TYPE "public"."berth_type" AS ENUM('SLEEPER_SINGLE', 'SLEEPER_DOUBLE', 'CABIN');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('CONFIRMED', 'PARTIALLY_PAID', 'CANCELLED', 'NO_SHOW', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."deck" AS ENUM('UPPER', 'LOWER', 'CABIN');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('ONWARD', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."double_sofa_policy" AS ENUM('INDEPENDENT', 'PAIRED', 'SOFT_PAIR');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F', 'O');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'WALLET', 'CREDIT', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."seat_status" AS ENUM('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."sofa_position" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('SCHEDULED', 'DEPARTED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boarding_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"offset_minutes" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'BOARDING' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pnr" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"primary_passenger_name" text NOT NULL,
	"primary_phone" text NOT NULL,
	"alt_phone" text,
	"email" text,
	"amount_total_paise" bigint NOT NULL,
	"amount_paid_paise" bigint DEFAULT 0 NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"status" "booking_status" DEFAULT 'CONFIRMED' NOT NULL,
	"boarding_point_id" uuid,
	"dropping_point_id" uuid,
	"note" text,
	"hold_id" uuid,
	"created_by_agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_agent_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"refund_paise" bigint
);
--> statement-breakpoint
CREATE TABLE "booking_seat" (
	"booking_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"passenger_name" text,
	"age" integer,
	"gender" "gender",
	"fare_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "booking_seat_booking_id_seat_id_pk" PRIMARY KEY("booking_id","seat_id")
);
--> statement-breakpoint
CREATE TABLE "bus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_no" text NOT NULL,
	"display_name" text NOT NULL,
	"note" text,
	"current_layout_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fare_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"direction" "direction",
	"berth_type" "berth_type" NOT NULL,
	"price_paise" bigint NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" text PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_json" jsonb,
	"status_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"reference_no" text,
	"received_by_agent_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"distance_km" integer,
	"default_duration_min" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"bus_id" uuid NOT NULL,
	"departure_time" text NOT NULL,
	"arrival_time" text NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"seat_number" text NOT NULL,
	"deck" "deck" NOT NULL,
	"berth_type" "berth_type" NOT NULL,
	"sofa_group_id" uuid,
	"sofa_position" "sofa_position",
	"row_index" integer NOT NULL,
	"col_index" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "double_needs_position" CHECK (
    ("seat"."berth_type" <> 'SLEEPER_DOUBLE')
    OR ("seat"."sofa_group_id" IS NOT NULL AND "seat"."sofa_position" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "seat_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"provisional_name" text,
	"provisional_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"release_reason" text
);
--> statement-breakpoint
CREATE TABLE "seat_layout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bus_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"double_sofa_policy" "double_sofa_policy" DEFAULT 'INDEPENDENT' NOT NULL,
	"sleeper_rows" integer DEFAULT 6 NOT NULL,
	"sleeper_cols" integer DEFAULT 4 NOT NULL,
	"cabin_rows" integer DEFAULT 1 NOT NULL,
	"cabin_cols" integer DEFAULT 5 NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"bus_id" uuid NOT NULL,
	"layout_id" uuid NOT NULL,
	"service_date" text NOT NULL,
	"departure_at" timestamp with time zone NOT NULL,
	"arrival_at" timestamp with time zone NOT NULL,
	"status" "trip_status" DEFAULT 'SCHEDULED' NOT NULL,
	"template_id" uuid,
	"total_seats" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_seat_state" (
	"trip_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"status" "seat_status" DEFAULT 'AVAILABLE' NOT NULL,
	"hold_id" uuid,
	"booking_id" uuid,
	"held_until" timestamp with time zone,
	"block_reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_seat_state_trip_id_seat_id_pk" PRIMARY KEY("trip_id","seat_id"),
	CONSTRAINT "held_needs_hold" CHECK (
    "trip_seat_state"."status" <> 'HELD' OR ("trip_seat_state"."hold_id" IS NOT NULL AND "trip_seat_state"."held_until" IS NOT NULL)
  ),
	CONSTRAINT "booked_needs_booking" CHECK (
    "trip_seat_state"."status" <> 'BOOKED' OR "trip_seat_state"."booking_id" IS NOT NULL
  )
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boarding_point" ADD CONSTRAINT "boarding_point_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_boarding_point_id_boarding_point_id_fk" FOREIGN KEY ("boarding_point_id") REFERENCES "public"."boarding_point"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_dropping_point_id_boarding_point_id_fk" FOREIGN KEY ("dropping_point_id") REFERENCES "public"."boarding_point"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_hold_id_seat_hold_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."seat_hold"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_created_by_agent_id_agent_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_updated_by_agent_id_agent_id_fk" FOREIGN KEY ("updated_by_agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_cancelled_by_agent_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_seat" ADD CONSTRAINT "booking_seat_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_seat" ADD CONSTRAINT "booking_seat_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fare_rule" ADD CONSTRAINT "fare_rule_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_received_by_agent_id_agent_id_fk" FOREIGN KEY ("received_by_agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_template" ADD CONSTRAINT "schedule_template_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_template" ADD CONSTRAINT "schedule_template_bus_id_bus_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_layout_id_seat_layout_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."seat_layout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_released_by_agent_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_layout" ADD CONSTRAINT "seat_layout_bus_id_bus_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_layout" ADD CONSTRAINT "seat_layout_created_by_agent_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_bus_id_bus_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."bus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_layout_id_seat_layout_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."seat_layout"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_template_id_schedule_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_created_by_agent_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_seat_state" ADD CONSTRAINT "trip_seat_state_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_seat_state" ADD CONSTRAINT "trip_seat_state_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_seat_state" ADD CONSTRAINT "trip_seat_state_hold_id_seat_hold_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."seat_hold"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_seat_state" ADD CONSTRAINT "trip_seat_state_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_email_uq" ON "agent" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_agent_idx" ON "audit_log" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "boarding_point_route_idx" ON "boarding_point" USING btree ("route_id","kind","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_pnr_uq" ON "booking" USING btree ("pnr");--> statement-breakpoint
CREATE INDEX "booking_trip_idx" ON "booking" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "booking_phone_idx" ON "booking" USING btree ("primary_phone");--> statement-breakpoint
CREATE INDEX "booking_created_idx" ON "booking" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "booking_agent_idx" ON "booking" USING btree ("created_by_agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bus_reg_uq" ON "bus" USING btree ("registration_no");--> statement-breakpoint
CREATE INDEX "fare_lookup_idx" ON "fare_rule" USING btree ("route_id","direction","berth_type");--> statement-breakpoint
CREATE INDEX "payment_booking_idx" ON "payment" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_code_uq" ON "route" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_layout_number_uq" ON "seat" USING btree ("layout_id","seat_number");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_layout_cell_uq" ON "seat" USING btree ("layout_id","deck","row_index","col_index");--> statement-breakpoint
CREATE INDEX "seat_layout_idx" ON "seat" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX "seat_sofa_group_idx" ON "seat" USING btree ("sofa_group_id");--> statement-breakpoint
CREATE INDEX "hold_active_expiry_idx" ON "seat_hold" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "hold_trip_idx" ON "seat_hold" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "hold_agent_idx" ON "seat_hold" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "layout_bus_version_uq" ON "seat_layout" USING btree ("bus_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_bus_date_dir_uq" ON "trip" USING btree ("bus_id","service_date","direction");--> statement-breakpoint
CREATE INDEX "trip_lookup_idx" ON "trip" USING btree ("service_date","route_id","direction","status");--> statement-breakpoint
CREATE INDEX "tss_trip_status_idx" ON "trip_seat_state" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "tss_held_until_idx" ON "trip_seat_state" USING btree ("held_until");