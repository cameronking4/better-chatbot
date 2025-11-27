-- Task Execution Tables Migration
-- Creates tables for the task orchestration system

CREATE TABLE IF NOT EXISTS "task_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"goal" text NOT NULL,
	"strategy" json,
	"current_step" text DEFAULT '0' NOT NULL,
	"context" json,
	"tool_call_history" json[],
	"checkpoints" json[],
	"retry_count" text DEFAULT '0' NOT NULL,
	"last_error" text,
	"estimated_completion" timestamp,
	"agent_id" uuid,
	"chat_model" json,
	"mentions" json[],
	"allowed_mcp_servers" json,
	"allowed_app_default_toolkit" json[],
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_execution_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_execution_id" uuid NOT NULL,
	"step_index" text NOT NULL,
	"description" text NOT NULL,
	"type" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"result" json,
	"error" text,
	"duration" text,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_execution_trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_execution_id" uuid NOT NULL,
	"trace_type" varchar NOT NULL,
	"message" text NOT NULL,
	"metadata" json,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'task_execution_user_id_user_id_fk'
	) THEN
		ALTER TABLE "task_execution" ADD CONSTRAINT "task_execution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'task_execution_thread_id_chat_thread_id_fk'
	) THEN
		ALTER TABLE "task_execution" ADD CONSTRAINT "task_execution_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'task_execution_agent_id_agent_id_fk'
	) THEN
		ALTER TABLE "task_execution" ADD CONSTRAINT "task_execution_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'task_execution_step_task_execution_id_task_execution_id_fk'
	) THEN
		ALTER TABLE "task_execution_step" ADD CONSTRAINT "task_execution_step_task_execution_id_task_execution_id_fk" FOREIGN KEY ("task_execution_id") REFERENCES "public"."task_execution"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'task_execution_trace_task_execution_id_task_execution_id_fk'
	) THEN
		ALTER TABLE "task_execution_trace" ADD CONSTRAINT "task_execution_trace_task_execution_id_task_execution_id_fk" FOREIGN KEY ("task_execution_id") REFERENCES "public"."task_execution"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_user_id_idx'
	) THEN
		CREATE INDEX "task_execution_user_id_idx" ON "task_execution" USING btree ("user_id");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_thread_id_idx'
	) THEN
		CREATE INDEX "task_execution_thread_id_idx" ON "task_execution" USING btree ("thread_id");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_status_idx'
	) THEN
		CREATE INDEX "task_execution_status_idx" ON "task_execution" USING btree ("status");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_created_at_idx'
	) THEN
		CREATE INDEX "task_execution_created_at_idx" ON "task_execution" USING btree ("created_at");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_step_task_id_idx'
	) THEN
		CREATE INDEX "task_execution_step_task_id_idx" ON "task_execution_step" USING btree ("task_execution_id");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_step_status_idx'
	) THEN
		CREATE INDEX "task_execution_step_status_idx" ON "task_execution_step" USING btree ("status");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_trace_task_id_idx'
	) THEN
		CREATE INDEX "task_execution_trace_task_id_idx" ON "task_execution_trace" USING btree ("task_execution_id");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_trace_type_idx'
	) THEN
		CREATE INDEX "task_execution_trace_type_idx" ON "task_execution_trace" USING btree ("trace_type");
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_indexes WHERE indexname = 'task_execution_trace_timestamp_idx'
	) THEN
		CREATE INDEX "task_execution_trace_timestamp_idx" ON "task_execution_trace" USING btree ("timestamp");
	END IF;
END $$;
