/**
 * Task Orchestration System
 *
 * This module provides a comprehensive system for orchestrating long-running,
 * multi-step chat tasks that may exceed context window limits or require
 * background processing.
 *
 * Key Components:
 * - TaskOrchestrator: Core orchestration logic for task planning and management
 * - Task Queue: BullMQ-based queue for background task execution
 * - Task Worker: Worker process that executes queued tasks
 * - Task Executor: Executes individual task steps (LLM reasoning, tool calls, etc.)
 *
 * Usage:
 * 1. Automatic: The chat route will automatically detect and orchestrate complex tasks
 * 2. Manual: Use the /api/chat/orchestrate endpoint to explicitly create orchestrated tasks
 * 3. Status: Use GET /api/chat/orchestrate?taskId=xxx to check task status
 */

export { TaskOrchestrator } from "./task-orchestrator";
export type {
  TaskContext,
  SubTask,
  TaskStrategy,
  OrchestratorConfig,
} from "./task-orchestrator";

export {
  chatTaskQueue,
  queueTaskStep,
  queueTaskContinuation,
  getJobStatus,
  cancelJob,
  getTaskJobs,
  removeTaskJobs,
} from "./task-queue";
export type { ChatTaskJobData } from "./task-queue";

export {
  startTaskWorker,
  stopTaskWorker,
  getWorker,
} from "./task-worker";

export {
  executeTaskStep,
} from "./task-executor";
export type {
  ExecuteTaskStepParams,
  StepExecutionResult,
} from "./task-executor";

export { initializeOrchestrationWorker } from "./init-worker";
