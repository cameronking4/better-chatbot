import { IS_VERCEL_ENV } from "lib/const";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!IS_VERCEL_ENV) {
      // run DB migration
      const runMigrate = await import("./lib/db/pg/migrate.pg").then(
        (m) => m.runMigrate,
      );
      await runMigrate().catch((e) => {
        console.error(e);
        process.exit(1);
      });
      const initMCPManager = await import("./lib/ai/mcp/mcp-manager").then(
        (m) => m.initMCPManager,
      );
      await initMCPManager();

      // Initialize scheduled task worker
      const { createScheduledTaskWorker } = await import(
        "./lib/scheduler/worker"
      );
      const { syncScheduledTasksToQueue } = await import(
        "./lib/scheduler/scheduler"
      );

      createScheduledTaskWorker();
      await syncScheduledTasksToQueue();
      console.log("Scheduled task worker initialized");
    }
  }
}
