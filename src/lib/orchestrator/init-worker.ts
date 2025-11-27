import { startTaskWorker } from "./task-worker";
import logger from "logger";
import { colorize } from "consola/utils";

const initLogger = logger.withDefaults({
  message: colorize("blueBright", `Orchestrator Init: `),
});

let workerInitialized = false;

/**
 * Initializes the task orchestration worker
 * This should be called explicitly when the application starts,
 * not automatically on module import to avoid memory leaks in
 * serverless/edge environments or during hot module replacement.
 */
export function initializeOrchestrationWorker() {
  if (workerInitialized) {
    initLogger.warn("Task worker already initialized, skipping");
    return;
  }

  if (process.env.DISABLE_TASK_WORKER === "true") {
    initLogger.warn("Task worker disabled via DISABLE_TASK_WORKER env var");
    return;
  }

  // Check Redis configuration
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    initLogger.warn(
      "Redis not configured, task orchestration worker will not start",
    );
    return;
  }

  try {
    startTaskWorker();
    workerInitialized = true;
    initLogger.success("Task orchestration worker initialized successfully");
  } catch (error) {
    initLogger.error("Failed to initialize task worker:", error);
    // Don't throw - let the app start even if worker fails
  }
}

/**
 * Note: Auto-initialization has been removed to prevent memory leaks
 * in serverless/edge environments. The worker should be initialized
 * explicitly in your app entry point (e.g., a dedicated initialization
 * module or middleware) if needed.
 *
 * Example usage:
 * ```
 * // In your app initialization code (e.g., instrumentation.ts or similar)
 * if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
 *   initializeOrchestrationWorker();
 * }
 * ```
 */
