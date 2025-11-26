CREATE TABLE "scheduled_task_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_task_id" uuid NOT NULL,
	"thread_id" uuid,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"duration" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"prompt" text NOT NULL,
	"schedule" json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"agent_id" uuid,
	"chat_model" json,
	"tool_choice" text DEFAULT 'auto',
	"mentions" json[] DEFAULT '[]'::json,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_task_execution" ADD CONSTRAINT "scheduled_task_execution_scheduled_task_id_scheduled_task_id_fk" FOREIGN KEY ("scheduled_task_id") REFERENCES "public"."scheduled_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_execution" ADD CONSTRAINT "scheduled_task_execution_thread_id_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task" ADD CONSTRAINT "scheduled_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task" ADD CONSTRAINT "scheduled_task_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_task_execution_task_id_idx" ON "scheduled_task_execution" USING btree ("scheduled_task_id");--> statement-breakpoint
CREATE INDEX "scheduled_task_execution_status_idx" ON "scheduled_task_execution" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_task_user_id_idx" ON "scheduled_task" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_task_next_run_idx" ON "scheduled_task" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_task_enabled_idx" ON "scheduled_task" USING btree ("enabled");