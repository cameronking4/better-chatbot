import { Queue, QueueOptions } from "bullmq";
import { redisConnection } from "./queue";
import logger from "logger";
import type { AdvancedChatApiRequestBody } from "@/types/advanced-chat";

export interface AdvancedChatJobData {
  jobId: string;
  threadId: string;
  userId: string;
  message: AdvancedChatApiRequestBody["message"];
  chatModel?: AdvancedChatApiRequestBody["chatModel"];
  toolChoice: AdvancedChatApiRequestBody["toolChoice"];
  mentions?: AdvancedChatApiRequestBody["mentions"];
  allowedMcpServers?: AdvancedChatApiRequestBody["allowedMcpServers"];
  allowedAppDefaultToolkit?: AdvancedChatApiRequestBody["allowedAppDefaultToolkit"];
  imageTool?: AdvancedChatApiRequestBody["imageTool"];
  attachments?: AdvancedChatApiRequestBody["attachments"];
  correlationId: string;
}

// Queue options for advanced chat jobs
const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // Start with 5 seconds, exponential backoff
    },
    removeOnComplete: {
      count: 50, // Keep last 50 completed jobs
      age: 7 * 24 * 3600, // Keep for 7 days
    },
    removeOnFail: {
      count: 100, // Keep last 100 failed jobs for debugging
      age: 7 * 24 * 3600, // Keep for 7 days
    },
    // Long TTL for jobs that may run for hours/days
    jobId: undefined, // Will be set when adding job
  },
};

// Advanced chat job queue
export const advancedChatQueue = new Queue<AdvancedChatJobData>(
  "advanced-chat-jobs",
  queueOptions,
);

// Log queue events
advancedChatQueue.on("error", (err) => {
  logger.error("Advanced chat queue error:", err);
});

advancedChatQueue.on("waiting", (job) => {
  logger.debug(`Advanced chat job ${job?.id} is waiting`);
});

advancedChatQueue.on("active", (job) => {
  logger.info(`Advanced chat job ${job?.id} is now active`);
});

advancedChatQueue.on("completed", (job) => {
  logger.info(`Advanced chat job ${job?.id} completed successfully`);
});

advancedChatQueue.on("failed", (job, err) => {
  logger.error(`Advanced chat job ${job?.id} failed:`, err);
});

logger.info("Advanced chat queue initialized");
