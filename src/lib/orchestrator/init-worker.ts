import { startTaskWorker } from "./task-worker";
import logger from "logger";
import { colorize } from "consola/utils";

const initLogger = logger.withDefaults({
  message: colorize("blueBright", `Orchestrator Init: `),
});

/**
 * Initializes the task orchestration worker
 * This should be called when the application starts
 */
export function initializeOrchestrationWorker() {
  if (process.env.DISABLE_TASK_WORKER === "true") {
    initLogger.warn("Task worker disabled via DISABLE_TASK_WORKER env var");
    return;
  }

  try {
    startTaskWorker();
    initLogger.success("Task orchestration worker initialized successfully");
  } catch (error) {
    initLogger.error("Failed to initialize task worker:", error);
    // Don't throw - let the app start even if worker fails
  }
}

// Auto-initialize in Node.js environment (not in Edge runtime)
if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  // Only initialize if Redis is configured
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    initializeOrchestrationWorker();
  } else {
    initLogger.warn(
      "Redis not configured, task orchestration worker will not start",
    );
  }
}
