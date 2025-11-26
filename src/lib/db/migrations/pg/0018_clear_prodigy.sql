ALTER TABLE "scheduled_task" ALTER COLUMN "mentions" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "preferences" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workflow_edge" ALTER COLUMN "ui_config" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workflow_node" ALTER COLUMN "ui_config" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workflow_node" ALTER COLUMN "node_config" DROP DEFAULT;