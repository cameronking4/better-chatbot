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

// Note: These events are not available on Queue, only on Worker
// See advanced-chat-worker.ts for worker event handlers

logger.info("Advanced chat queue initialized");
