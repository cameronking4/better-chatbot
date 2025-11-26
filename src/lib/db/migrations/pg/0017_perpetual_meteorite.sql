DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_name = 'scheduled_task' AND column_name = 'allowed_mcp_servers'
	) THEN
		ALTER TABLE "scheduled_task" ADD COLUMN "allowed_mcp_servers" json DEFAULT '{}'::json;
	END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_name = 'scheduled_task' AND column_name = 'allowed_app_default_toolkit'
	) THEN
		ALTER TABLE "scheduled_task" ADD COLUMN "allowed_app_default_toolkit" json[] DEFAULT '{}'::json[];
	END IF;
END $$;