import { Queue, Worker, Job } from "bullmq";
import { redisConnection } from "lib/scheduler/queue";
import logger from "logger";
import { colorize } from "consola/utils";

const taskLogger = logger.withDefaults({
  message: colorize("magenta", `Task Queue: `),
});

export interface ChatTaskJobData {
  taskId: string;
  userId: string;
  threadId: string;
  stepIndex: number;
  retryCount?: number;
}

// Chat task queue for orchestrated task execution
export const chatTaskQueue = new Queue<ChatTaskJobData>("chat-tasks", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      count: 50, // Keep last 50 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 100, // Keep last 100 failed jobs for debugging
    },
  },
});

// Log queue events
chatTaskQueue.on("error", (err) => {
  taskLogger.error("Chat task queue error:", err);
});

taskLogger.info("Chat task queue initialized");

/**
 * Adds a task execution step to the queue
 */
export async function queueTaskStep(data: ChatTaskJobData): Promise<Job> {
  const job = await chatTaskQueue.add("execute-step", data, {
    jobId: `${data.taskId}-step-${data.stepIndex}`,
  });

  taskLogger.info(
    `Queued task step: ${data.taskId} step ${data.stepIndex} (job ${job.id})`,
  );

  return job;
}

/**
 * Adds a task continuation to the queue (for next step)
 */
export async function queueTaskContinuation(
  data: ChatTaskJobData,
  delay = 1000,
): Promise<Job> {
  const job = await chatTaskQueue.add("continue-task", data, {
    jobId: `${data.taskId}-continue-${data.stepIndex}`,
    delay, // Delay before processing next step
  });

  taskLogger.info(
    `Queued task continuation: ${data.taskId} step ${data.stepIndex} with ${delay}ms delay`,
  );

  return job;
}

/**
 * Gets the status of a job
 */
export async function getJobStatus(
  jobId: string,
): Promise<{ state: string; progress?: any; result?: any } | null> {
  const job = await chatTaskQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const returnvalue = job.returnvalue;

  return {
    state,
    progress,
    result: returnvalue,
  };
}

/**
 * Cancels a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await chatTaskQueue.getJob(jobId);

  if (!job) {
    return false;
  }

  await job.remove();
  taskLogger.info(`Cancelled job: ${jobId}`);

  return true;
}

/**
 * Gets all jobs for a task
 */
export async function getTaskJobs(
  taskId: string,
): Promise<Array<{ id: string; state: string; data: ChatTaskJobData }>> {
  const jobs = await chatTaskQueue.getJobs([
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  ]);

  const taskJobs = jobs.filter((job) => job.data.taskId === taskId);

  return Promise.all(
    taskJobs.map(async (job) => ({
      id: job.id!,
      state: await job.getState(),
      data: job.data,
    })),
  );
}

/**
 * Removes all jobs for a task (useful for cleanup)
 */
export async function removeTaskJobs(taskId: string): Promise<number> {
  const jobs = await getTaskJobs(taskId);

  await Promise.all(
    jobs.map(async (jobInfo) => {
      const job = await chatTaskQueue.getJob(jobInfo.id);
      if (job) {
        await job.remove();
      }
    }),
  );

  taskLogger.info(`Removed ${jobs.length} jobs for task ${taskId}`);

  return jobs.length;
}
