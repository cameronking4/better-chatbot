import { Queue, QueueOptions } from "bullmq";
import IORedis from "ioredis";
import logger from "logger";

// Redis connection for BullMQ
const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
    })
  : new IORedis({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

connection.on("error", (err) => {
  logger.error("Redis connection error for BullMQ:", err);
});

connection.on("connect", () => {
  logger.info("BullMQ connected to Redis");
});

// Queue options
const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
    },
  },
};

// Task execution queue
export const scheduledTaskQueue = new Queue("scheduled-tasks", queueOptions);

// Log queue events
scheduledTaskQueue.on("error", (err) => {
  logger.error("Scheduled task queue error:", err);
});

// Note: These events are not available on Queue, only on Worker
// scheduledTaskQueue.on("waiting", (job) => {
//   logger.debug(`Job ${job.id} is waiting`);
// });

// scheduledTaskQueue.on("active", (job) => {
//   logger.debug(`Job ${job.id} is now active`);
// });

// scheduledTaskQueue.on("completed", (job) => {
//   logger.info(`Job ${job.id} completed successfully`);
// });

// scheduledTaskQueue.on("failed", (job, err) => {
//   logger.error(`Job ${job?.id} failed:`, err);
// });

export { connection as redisConnection };
