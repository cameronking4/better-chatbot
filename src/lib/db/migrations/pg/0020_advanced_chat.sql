CREATE TABLE IF NOT EXISTS "advanced_chat_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar NOT NULL DEFAULT 'pending',
	"current_iteration" integer DEFAULT 0 NOT NULL,
	"correlation_id" text NOT NULL,
	"metadata" json,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advanced_chat_iteration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"iteration_number" integer NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"context_summary_id" uuid,
	"messages_snapshot" json[] NOT NULL,
	"tool_calls" json[],
	"error" text,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advanced_chat_context_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"summary_text" text NOT NULL,
	"messages_summarized" integer NOT NULL,
	"token_count_before" integer NOT NULL,
	"token_count_after" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "advanced_chat_job" ADD CONSTRAINT "advanced_chat_job_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "advanced_chat_job" ADD CONSTRAINT "advanced_chat_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "advanced_chat_iteration" ADD CONSTRAINT "advanced_chat_iteration_job_id_advanced_chat_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."advanced_chat_job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "advanced_chat_iteration" ADD CONSTRAINT "advanced_chat_iteration_context_summary_id_advanced_chat_context_summary_id_fk" FOREIGN KEY ("context_summary_id") REFERENCES "public"."advanced_chat_context_summary"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "advanced_chat_context_summary" ADD CONSTRAINT "advanced_chat_context_summary_job_id_advanced_chat_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."advanced_chat_job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_job_thread_id_idx" ON "advanced_chat_job" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_job_user_id_idx" ON "advanced_chat_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_job_status_idx" ON "advanced_chat_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_job_correlation_id_idx" ON "advanced_chat_job" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_iteration_job_id_idx" ON "advanced_chat_iteration" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_iteration_iteration_number_idx" ON "advanced_chat_iteration" USING btree ("iteration_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advanced_chat_context_summary_job_id_idx" ON "advanced_chat_context_summary" USING btree ("job_id");

