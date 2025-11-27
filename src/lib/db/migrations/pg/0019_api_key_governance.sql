-- Migration: Add API Key table for user-governed programmatic access
-- Issue: #11 - Feature: API Key Governance for Programmatic Chat Route Access

CREATE TABLE IF NOT EXISTS "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY['chat:read', 'chat:write']::text[] NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_user_id_idx" ON "api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_prefix_idx" ON "api_key" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_active_idx" ON "api_key" USING btree ("user_id") WHERE "revoked_at" IS NULL;
