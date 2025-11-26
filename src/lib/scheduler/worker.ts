import { Worker, Job } from "bullmq";
import { redisConnection } from "./queue";
import { scheduledTaskRepository } from "@/lib/db/repository";
import { executeScheduledTask } from "./task-executor";
import { calculateNextRun } from "./schedule-utils";
import logger from "logger";

export interface ScheduledTaskJobData {
  scheduledTaskId: string;
  userId: string;
}

/**
 * Process a scheduled task job
 */
async function processScheduledTask(job: Job<ScheduledTaskJobData>) {
  const { scheduledTaskId, userId } = job.data;

  logger.info(`Processing scheduled task job: ${scheduledTaskId}`);

  // Load task from database (source of truth)
  const task = await scheduledTaskRepository.selectScheduledTask(
    scheduledTaskId,
    userId,
  );

  if (!task) {
    logger.warn(`Scheduled task ${scheduledTaskId} not found, skipping`);
    return { skipped: true, reason: "Task not found" };
  }

  if (!task.enabled) {
    logger.info(`Scheduled task ${scheduledTaskId} is disabled, skipping`);
    return { skipped: true, reason: "Task disabled" };
  }

  // Create execution record
  const execution = await scheduledTaskRepository.insertExecution({
    scheduledTaskId: task.id,
    status: "running",
    startedAt: new Date(),
  });

  try {
    // Execute the task
    const result = await executeScheduledTask(task);

    // Update execution record
    await scheduledTaskRepository.updateExecution(execution.id, {
      status: result.success ? "success" : "failed",
      threadId: result.threadId,
      error: result.error,
      completedAt: new Date(),
      duration: result.duration.toString(),
    });

    // Update task's last run time and calculate next run
    const nextRunAt = calculateNextRun(task.schedule);
    await scheduledTaskRepository.updateLastRun(
      task.id,
      new Date(),
      nextRunAt,
    );

    if (result.success) {
      logger.info(
        `Scheduled task ${task.name} executed successfully, thread: ${result.threadId}`,
      );
      return {
        success: true,
        threadId: result.threadId,
        duration: result.duration,
      };
    } else {
      throw new Error(result.error || "Task execution failed");
    }
  } catch (error: any) {
    // Update execution record with failure
    await scheduledTaskRepository.updateExecution(execution.id, {
      status: "failed",
      error: error.message,
      completedAt: new Date(),
    });

    logger.error(`Scheduled task ${task.name} failed:`, error);
    throw error; // BullMQ will retry based on job options
  }
}

/**
 * Create and start the BullMQ worker
 */
export function createScheduledTaskWorker() {
  const worker = new Worker<ScheduledTaskJobData>(
    "scheduled-tasks",
    processScheduledTask,
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 tasks concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info(`Worker completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Worker failed job ${job?.id}:`, err);
  });

  worker.on("error", (err) => {
    logger.error("Worker error:", err);
  });

  logger.info("Scheduled task worker started");

  return worker;
}
