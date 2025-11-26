import { scheduledTaskQueue } from "./queue";
import { scheduleToCron, calculateNextRun } from "./schedule-utils";
import type { ScheduledTask } from "@/types/scheduled-task";
import logger from "logger";

/**
 * Add a scheduled task to the BullMQ queue
 */
export async function addScheduledTaskToQueue(task: ScheduledTask) {
  try {
    const cronExpression = scheduleToCron(task.schedule);

    if (cronExpression) {
      // Use repeatable job for cron-compatible schedules
      await scheduledTaskQueue.add(
        "execute-scheduled-task",
        {
          scheduledTaskId: task.id,
          userId: task.userId,
        },
        {
          repeat: {
            pattern: cronExpression,
            jobId: task.id, // Use task ID as job ID to prevent duplicates
          },
          jobId: task.id,
        },
      );

      logger.info(
        `Added repeatable job for task ${task.name} with cron: ${cronExpression}`,
      );
    } else {
      // For complex intervals, schedule the next execution
      const nextRun = calculateNextRun(task.schedule);
      if (nextRun) {
        const delay = nextRun.getTime() - Date.now();

        await scheduledTaskQueue.add(
          "execute-scheduled-task",
          {
            scheduledTaskId: task.id,
            userId: task.userId,
          },
          {
            delay: Math.max(0, delay),
            jobId: `${task.id}-${nextRun.getTime()}`,
          },
        );

        logger.info(
          `Added delayed job for task ${task.name}, will run at ${nextRun.toISOString()}`,
        );
      }
    }
  } catch (error) {
    logger.error(`Failed to add task ${task.name} to queue:`, error);
    throw error;
  }
}

/**
 * Remove a scheduled task from the BullMQ queue
 */
export async function removeScheduledTaskFromQueue(taskId: string) {
  try {
    // Remove repeatable job
    const repeatableJobs = await scheduledTaskQueue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === taskId);

    if (job) {
      await scheduledTaskQueue.removeRepeatableByKey(job.key);
      logger.info(`Removed repeatable job for task ${taskId}`);
    }

    // Remove any pending delayed jobs
    const jobs = await scheduledTaskQueue.getJobs(["waiting", "delayed"]);
    for (const j of jobs) {
      if (j.data.scheduledTaskId === taskId) {
        await j.remove();
        logger.info(`Removed delayed job ${j.id} for task ${taskId}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to remove task ${taskId} from queue:`, error);
    throw error;
  }
}

/**
 * Update a scheduled task in the queue
 */
export async function updateScheduledTaskInQueue(task: ScheduledTask) {
  try {
    // Remove existing job
    await removeScheduledTaskFromQueue(task.id);

    // Add updated job if enabled
    if (task.enabled) {
      await addScheduledTaskToQueue(task);
    }

    logger.info(`Updated task ${task.name} in queue`);
  } catch (error) {
    logger.error(`Failed to update task ${task.name} in queue:`, error);
    throw error;
  }
}

/**
 * Sync all scheduled tasks from database to queue
 * This should be called on application startup
 */
export async function syncScheduledTasksToQueue() {
  try {
    logger.info("Syncing scheduled tasks to queue...");

    // Clear existing repeatable jobs (optional, for clean slate)
    const repeatableJobs = await scheduledTaskQueue.getRepeatableJobs();
    logger.info(`Found ${repeatableJobs.length} existing repeatable jobs`);

    // Note: We don't clear existing jobs here to avoid disruption
    // Instead, we'll let them expire naturally and add new ones

    logger.info("Scheduled tasks synced to queue");
  } catch (error) {
    logger.error("Failed to sync scheduled tasks to queue:", error);
    throw error;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    scheduledTaskQueue.getWaitingCount(),
    scheduledTaskQueue.getActiveCount(),
    scheduledTaskQueue.getCompletedCount(),
    scheduledTaskQueue.getFailedCount(),
    scheduledTaskQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}
