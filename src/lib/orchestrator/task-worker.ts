import { Worker, Job } from "bullmq";
import { redisConnection } from "lib/scheduler/queue";
import { taskExecutionRepository } from "lib/db/repository";
import { TaskOrchestrator } from "./task-orchestrator";
import { ChatTaskJobData, queueTaskContinuation } from "./task-queue";
import logger from "logger";
import { colorize } from "consola/utils";
import { executeTaskStep } from "./task-executor";

const workerLogger = logger.withDefaults({
  message: colorize("green", `Task Worker: `),
});

let worker: Worker<ChatTaskJobData> | null = null;

/**
 * Starts the task worker for processing orchestrated chat tasks
 */
export function startTaskWorker(): Worker<ChatTaskJobData> {
  if (worker) {
    workerLogger.warn("Task worker already running");
    return worker;
  }

  worker = new Worker<ChatTaskJobData>(
    "chat-tasks",
    async (job: Job<ChatTaskJobData>) => {
      const { taskId, userId, threadId, stepIndex } = job.data;

      workerLogger.info(
        `Processing job ${job.id}: task ${taskId} step ${stepIndex}`,
      );

      try {
        // Get task from database
        const task = await taskExecutionRepository.getTaskExecution(taskId);

        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Create orchestrator instance
        const orchestrator = new TaskOrchestrator({
          chatModel: task.chatModel || {
            provider: "anthropic",
            model: "claude-3-5-sonnet-20241022",
          },
        });

        // Evaluate if we should continue
        const { shouldContinue, reason } =
          await orchestrator.evaluateProgress(task);

        if (!shouldContinue) {
          workerLogger.info(`Task ${taskId} should not continue: ${reason}`);

          // Update task status
          await taskExecutionRepository.updateTaskStatus(
            taskId,
            task.status === "failed" ? "failed" : "completed",
          );

          return { success: true, completed: true, reason };
        }

        // Get next action
        const nextAction = await orchestrator.selectNextAction(task);

        if (!nextAction) {
          workerLogger.info(`No next action for task ${taskId}, completing`);

          await taskExecutionRepository.updateTaskStatus(taskId, "completed");

          return { success: true, completed: true };
        }

        // Update task status to running
        await taskExecutionRepository.updateTaskStatus(taskId, "running");

        // Execute the step
        const stepResult = await executeTaskStep({
          taskId,
          userId,
          threadId,
          stepIndex,
          stepDescription: nextAction.description,
          stepType: nextAction.action as any,
          task,
        });

        // Update progress
        await taskExecutionRepository.updateProgress(
          taskId,
          (stepIndex + 1).toString(),
        );

        // Check if we should create a checkpoint
        const checkpointInterval = 5; // Every 5 steps
        if ((stepIndex + 1) % checkpointInterval === 0 && task.context) {
          await orchestrator.createCheckpoint(taskId, stepIndex + 1, task.context);
        }

        // Update job progress
        const totalSteps = task.strategy?.totalSteps || 1;
        const progress = ((stepIndex + 1) / totalSteps) * 100;
        await job.updateProgress(progress);

        // Queue next step if there are more
        if (stepIndex + 1 < totalSteps) {
          await queueTaskContinuation({
            taskId,
            userId,
            threadId,
            stepIndex: stepIndex + 1,
          });
        } else {
          // Task completed
          await taskExecutionRepository.updateTaskStatus(taskId, "completed");
          workerLogger.info(`Task ${taskId} completed successfully`);
        }

        return {
          success: true,
          stepResult,
          nextStep: stepIndex + 1 < totalSteps ? stepIndex + 1 : null,
        };
      } catch (error) {
        workerLogger.error(`Error processing job ${job.id}:`, error);

        // Update task with error
        await taskExecutionRepository.updateTaskStatus(
          taskId,
          "failed",
          error instanceof Error ? error.message : String(error),
        );

        // Add error trace
        await taskExecutionRepository.addTrace({
          taskExecutionId: taskId,
          traceType: "error",
          message: `Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
          metadata: { jobId: job.id, stepIndex, error: String(error) },
        });

        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 tasks concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // per second
      },
    },
  );

  // Worker event handlers
  worker.on("completed", (job) => {
    workerLogger.info(`Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    workerLogger.error(`Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    workerLogger.error("Worker error:", err);
  });

  workerLogger.info("Task worker started with concurrency 5");

  return worker;
}

/**
 * Stops the task worker
 */
export async function stopTaskWorker(): Promise<void> {
  if (!worker) {
    return;
  }

  await worker.close();
  worker = null;

  workerLogger.info("Task worker stopped");
}

/**
 * Gets the current worker instance
 */
export function getWorker(): Worker<ChatTaskJobData> | null {
  return worker;
}
