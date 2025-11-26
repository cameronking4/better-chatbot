import { chatRepository } from "@/lib/db/repository";
import type { ScheduledTask } from "@/types/scheduled-task";
import logger from "logger";
import { generateUUID } from "@/lib/utils";

export interface TaskExecutionResult {
  success: boolean;
  threadId?: string;
  error?: string;
  duration: number;
}

/**
 * Execute a scheduled task by calling the chat API
 */
export async function executeScheduledTask(
  task: ScheduledTask,
): Promise<TaskExecutionResult> {
  const startTime = Date.now();

  try {
    logger.info(`Executing scheduled task: ${task.name} (${task.id})`);

    // Create a new thread for this execution
    const thread = await chatRepository.insertThread({
      id: generateUUID(),
      title: `[Scheduled] ${task.name}`,
      userId: task.userId,
    });

    logger.info(`Created thread ${thread.id} for scheduled task ${task.id}`);

    // Create the user message
    const messageId = generateUUID();
    const userMessage = {
      id: messageId,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: task.prompt,
        },
      ],
    };

    // Save the user message
    await chatRepository.upsertMessage({
      threadId: thread.id,
      id: userMessage.id,
      role: userMessage.role,
      parts: userMessage.parts,
    });

    // Call the chat API internally
    const chatApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;

    const response = await fetch(`${chatApiUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        id: thread.id,
        message: userMessage,
        chatModel: task.chatModel || {
          provider: "openai",
          model: "gpt-4",
        },
        toolChoice: task.toolChoice || "auto",
        mentions: task.mentions || [],
        allowedAppDefaultToolkit: [],
        allowedMcpServers: {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Chat API returned ${response.status}: ${errorText}`,
      );
    }

    // Stream is handled by the chat API, we just need to wait for completion
    // The response will be a stream, but we don't need to process it here
    // as it's already being saved to the database by the chat route

    const duration = Date.now() - startTime;

    logger.info(
      `Scheduled task ${task.name} completed successfully in ${duration}ms`,
    );

    return {
      success: true,
      threadId: thread.id,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`Scheduled task ${task.name} failed:`, error);

    return {
      success: false,
      error: error.message || "Unknown error",
      duration,
    };
  }
}
