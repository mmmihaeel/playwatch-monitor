CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TABLE "app_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitored_app_id" uuid NOT NULL,
	"object_key" text,
	"captured_at" timestamp with time zone NOT NULL,
	"status" "capture_status" NOT NULL,
	"content_hash" text,
	"changed_from_previous" boolean,
	"previous_snapshot_id" uuid,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" text NOT NULL,
	"title" text,
	"source_url" text NOT NULL,
	"region" text DEFAULT 'US' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"capture_frequency_minutes" integer DEFAULT 60 NOT NULL,
	"next_capture_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitored_apps_package_id_unique" UNIQUE("package_id")
);
--> statement-breakpoint
ALTER TABLE "app_snapshots" ADD CONSTRAINT "app_snapshots_monitored_app_id_monitored_apps_id_fk" FOREIGN KEY ("monitored_app_id") REFERENCES "public"."monitored_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_snapshots" ADD CONSTRAINT "app_snapshots_previous_snapshot_id_app_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "public"."app_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_app_snapshots_monitored_app_captured_at" ON "app_snapshots" USING btree ("monitored_app_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_app_snapshots_previous_snapshot_id" ON "app_snapshots" USING btree ("previous_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_monitored_apps_next_capture_at" ON "monitored_apps" USING btree ("next_capture_at");
