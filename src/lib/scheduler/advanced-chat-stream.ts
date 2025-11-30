import IORedis from "ioredis";
import logger from "logger";
import { redisConnection } from "./queue";

/**
 * Redis pub/sub client for streaming advanced chat events
 * Uses the same Redis connection as BullMQ
 */
let streamRedisClient: IORedis | null = null;

function getStreamRedisClient(): IORedis {
  if (!streamRedisClient) {
    // Create a new Redis client for pub/sub (can't use the same connection for pub/sub)
    const redisUrl = process.env.REDIS_URL;
    streamRedisClient = redisUrl
      ? new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        })
      : new IORedis({
          host: "localhost",
          port: 6379,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

    streamRedisClient.on("error", (err) => {
      logger.error("Advanced chat stream Redis client error:", err);
    });

    streamRedisClient.on("connect", () => {
      logger.info("Advanced chat stream Redis client connected");
    });
  }
  return streamRedisClient;
}

/**
 * Channel name for a specific job's stream events
 */
export function getJobStreamChannel(jobId: string): string {
  return `advanced-chat:stream:${jobId}`;
}

/**
 * Publish a stream event for a job
 */
export async function publishStreamEvent(
  jobId: string,
  event: {
    type: string;
    [key: string]: any;
  },
): Promise<void> {
  try {
    const client = getStreamRedisClient();
    const channel = getJobStreamChannel(jobId);
    await client.publish(channel, JSON.stringify(event));
  } catch (error: any) {
    logger.error(`Failed to publish stream event for job ${jobId}:`, error);
  }
}

/**
 * Subscribe to stream events for a job
 */
export function subscribeToJobStream(
  jobId: string,
  onEvent: (event: { type: string; [key: string]: any }) => void,
): {
  unsubscribe: () => void;
} {
  const client = getStreamRedisClient();
  const channel = getJobStreamChannel(jobId);
  const subscriber = client.duplicate();

  subscriber.on("error", (err) => {
    logger.error(`Stream subscriber error for job ${jobId}:`, err);
  });

  subscriber.subscribe(channel, (err) => {
    if (err) {
      logger.error(`Failed to subscribe to stream for job ${jobId}:`, err);
    } else {
      logger.info(`Subscribed to stream for job ${jobId}`);
    }
  });

  subscriber.on("message", (ch, message) => {
    if (ch === channel) {
      try {
        const event = JSON.parse(message);
        onEvent(event);
      } catch (error: any) {
        logger.error(`Failed to parse stream event for job ${jobId}:`, error);
      }
    }
  });

  return {
    unsubscribe: () => {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    },
  };
}
