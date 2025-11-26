import { scheduledTaskQueue } from "./queue";
import { scheduleToCron, calculateNextRun } from "./schedule-utils";
import type { ScheduledTask } from "@/types/scheduled-task";
import { scheduledTaskRepository } from "@/lib/db/repository";
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
    const repeatableJob = repeatableJobs.find((j) => j.id === taskId);

    if (repeatableJob) {
      try {
        await scheduledTaskQueue.removeRepeatableByKey(repeatableJob.key);
        logger.info(`Removed repeatable job for task ${taskId}`);
      } catch (error: any) {
        // Log but don't throw - repeatable jobs might not exist or already be removed
        logger.warn(
          `Could not remove repeatable job for task ${taskId}:`,
          error.message,
        );
      }
    }

    // Remove any pending delayed jobs (but skip repeatable jobs)
    const jobs = await scheduledTaskQueue.getJobs(["waiting", "delayed"]);
    const repeatableJobIds = new Set(
      repeatableJobs.map((j) => j.id).filter(Boolean),
    );

    for (const j of jobs) {
      if (j.data.scheduledTaskId === taskId) {
        // Skip if this job's ID matches a repeatable job ID
        // (repeatable jobs can't be removed with j.remove())
        if (
          repeatableJobIds.has(j.id || "") ||
          repeatableJobIds.has(j.opts?.jobId || "")
        ) {
          continue;
        }

        try {
          await j.remove();
          logger.info(`Removed delayed job ${j.id} for task ${taskId}`);
        } catch (error: any) {
          // Log but don't throw - job might not exist or be a repeatable job
          // Check if error indicates it's a repeatable job
          if (error.message?.includes("job scheduler") || error.code === -8) {
            logger.debug(
              `Skipped removing repeatable job ${j.id} for task ${taskId}`,
            );
          } else {
            logger.warn(
              `Could not remove job ${j.id} for task ${taskId}:`,
              error.message,
            );
          }
        }
      }
    }
  } catch (error: any) {
    // Log but don't throw - queue operations are best effort
    // The database update is what matters, queue will sync on next restart
    logger.warn(`Failed to remove task ${taskId} from queue:`, error.message);
  }
}

/**
 * Update a scheduled task in the queue
 */
export async function updateScheduledTaskInQueue(task: ScheduledTask) {
  try {
    // Remove existing job (best effort - won't throw)
    await removeScheduledTaskFromQueue(task.id);

    // Add updated job if enabled
    if (task.enabled) {
      try {
        await addScheduledTaskToQueue(task);
        logger.info(`Updated task ${task.name} in queue`);
      } catch (error: any) {
        // Log but don't throw - queue operations are best effort
        logger.warn(`Could not add task ${task.name} to queue:`, error.message);
      }
    } else {
      logger.info(`Task ${task.name} disabled, removed from queue`);
    }
  } catch (error: any) {
    // Log but don't throw - queue operations are best effort
    // The database update is what matters, queue will sync on next restart
    logger.warn(`Failed to update task ${task.name} in queue:`, error.message);
  }
}

/**
 * Sync all scheduled tasks from database to queue
 * This should be called on application startup
 */
export async function syncScheduledTasksToQueue() {
  try {
    logger.info("Syncing scheduled tasks to queue...");

    // Get all enabled tasks from database
    const enabledTasks = await scheduledTaskRepository.selectEnabledTasks();
    logger.info(`Found ${enabledTasks.length} enabled tasks in database`);

    // Clear existing repeatable jobs to avoid duplicates
    const repeatableJobs = await scheduledTaskQueue.getRepeatableJobs();
    logger.info(
      `Found ${repeatableJobs.length} existing repeatable jobs in queue`,
    );

    for (const job of repeatableJobs) {
      try {
        await scheduledTaskQueue.removeRepeatableByKey(job.key);
        logger.debug(`Removed existing repeatable job: ${job.id}`);
      } catch (error: any) {
        logger.warn(
          `Could not remove repeatable job ${job.id}:`,
          error.message,
        );
      }
    }

    // Remove any existing delayed jobs for these tasks
    const existingJobs = await scheduledTaskQueue.getJobs([
      "waiting",
      "delayed",
    ]);
    const taskIds = new Set(enabledTasks.map((t) => t.id));
    for (const job of existingJobs) {
      if (job.data.scheduledTaskId && taskIds.has(job.data.scheduledTaskId)) {
        try {
          await job.remove();
          logger.debug(
            `Removed existing job ${job.id} for task ${job.data.scheduledTaskId}`,
          );
        } catch (error: any) {
          logger.warn(`Could not remove job ${job.id}:`, error.message);
        }
      }
    }

    // Add all enabled tasks to the queue
    let addedCount = 0;
    let skippedCount = 0;
    for (const task of enabledTasks) {
      try {
        await addScheduledTaskToQueue(task);
        addedCount++;
        logger.debug(`Added task ${task.name} (${task.id}) to queue`);
      } catch (error: any) {
        skippedCount++;
        logger.warn(
          `Failed to add task ${task.name} (${task.id}) to queue:`,
          error.message,
        );
      }
    }

    logger.info(
      `Scheduled tasks sync completed: ${addedCount} added, ${skippedCount} skipped`,
    );
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
