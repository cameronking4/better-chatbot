import { generateText } from "ai";
import { UIMessage } from "ai";
import { customModelProvider } from "./models";
import type { ChatModel } from "@/types/chat";
import logger from "logger";
import {
  calculateCumulativeTokens,
  estimateTotalTokens,
  shouldSummarize,
} from "./token-monitor";
import type { AdvancedChatIteration } from "@/types/advanced-chat";

export interface SummarizationResult {
  summaryText: string;
  messagesSummarized: number;
  tokenCountBefore: number;
  tokenCountAfter: number;
  optimizedMessages: UIMessage[];
}

/**
 * Summarize conversation context while preserving recent messages
 * Strategy: Keep last 2 user/assistant pairs, summarize everything else
 */
export async function summarizeContext(
  messages: UIMessage[],
  systemPrompt: string,
  model?: ChatModel,
  previousIterations?: Array<{
    inputTokens: number;
    outputTokens: number;
  }>,
): Promise<SummarizationResult> {
  // Calculate cumulative tokens if we have previous iterations
  let cumulativeTokens = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    iterations: 0,
  };

  if (previousIterations && previousIterations.length > 0) {
    cumulativeTokens = calculateCumulativeTokens(previousIterations);
  }

  // Add current estimated tokens
  const currentEstimated = estimateTotalTokens(messages, systemPrompt);
  cumulativeTokens.totalTokens += currentEstimated;

  // Check if summarization is needed
  const shouldSummarizeResult = shouldSummarize(cumulativeTokens, model);
  if (!shouldSummarizeResult.needed && messages.length <= 10) {
    // No summarization needed if we're under threshold and have few messages
    return {
      summaryText: "",
      messagesSummarized: 0,
      tokenCountBefore: cumulativeTokens.totalTokens,
      tokenCountAfter: cumulativeTokens.totalTokens,
      optimizedMessages: messages,
    };
  }

  logger.info(
    `Summarizing context: ${messages.length} messages, cumulative tokens: ${cumulativeTokens.totalTokens}, threshold: ${shouldSummarizeResult.threshold}`,
  );

  // Find last 2 user/assistant pairs
  const recentPairs: UIMessage[] = [];
  let userCount = 0;

  // Go backwards through messages to find last 2 user messages and their responses
  for (let i = messages.length - 1; i >= 0 && userCount < 2; i--) {
    const message = messages[i];
    if (message.role === "user") {
      recentPairs.unshift(message);
      userCount++;

      // Include the assistant response that follows (if exists)
      if (i + 1 < messages.length && messages[i + 1].role === "assistant") {
        recentPairs.push(messages[i + 1]);
      }
    }
  }

  // Messages to summarize (everything except recent pairs)
  const messagesToSummarize = messages.filter(
    (msg) => !recentPairs.some((recent) => recent.id === msg.id),
  );

  if (messagesToSummarize.length === 0) {
    // Nothing to summarize
    return {
      summaryText: "",
      messagesSummarized: 0,
      tokenCountBefore: cumulativeTokens.totalTokens,
      tokenCountAfter: cumulativeTokens.totalTokens,
      optimizedMessages: messages,
    };
  }

  // Generate summary using LLM
  const summaryModel = model
    ? customModelProvider.getModel(model)
    : customModelProvider.getModel({
        provider: "openai",
        model: "gpt-4-turbo",
      });

  // Convert messages to text format for summarization
  const conversationText = messagesToSummarize
    .map((msg) => {
      const textParts = msg.parts
        .filter((p) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ");
      return `${msg.role}: ${textParts}`;
    })
    .join("\n\n");

  const summaryPrompt = `Please provide a concise summary of the following conversation. Focus on:
- Key topics discussed
- Important decisions made
- Relevant context and background information
- Any important facts or data mentioned

Conversation to summarize:
${conversationText}

Summary:`;

  try {
    const summaryResponse = await generateText({
      model: summaryModel,
      prompt: summaryPrompt,
    });

    const summaryText = summaryResponse.text;
    const summaryTokenCount = summaryResponse.usage?.totalTokens ?? 0;

    // Create summary message
    const summaryMessage: UIMessage = {
      id: `summary-${Date.now()}`,
      role: "system",
      parts: [
        {
          type: "text",
          text: `Previous conversation summary (${messagesToSummarize.length} messages):\n\n${summaryText}`,
        },
      ],
    };

    // Build optimized message array: [summary] + [recent pairs]
    const optimizedMessages: UIMessage[] = [summaryMessage, ...recentPairs];

    const tokenCountAfter =
      cumulativeTokens.totalTokens -
      estimateTotalTokens(messagesToSummarize, "") +
      summaryTokenCount +
      estimateTotalTokens(recentPairs, "");

    logger.info(
      `Context summarized: ${messagesToSummarize.length} messages -> summary (${summaryTokenCount} tokens), reduced from ${cumulativeTokens.totalTokens} to ~${tokenCountAfter} tokens`,
    );

    return {
      summaryText,
      messagesSummarized: messagesToSummarize.length,
      tokenCountBefore: cumulativeTokens.totalTokens,
      tokenCountAfter,
      optimizedMessages,
    };
  } catch (error) {
    logger.error("Failed to generate context summary:", error);
    // Fallback: return original messages if summarization fails
    return {
      summaryText: "",
      messagesSummarized: 0,
      tokenCountBefore: cumulativeTokens.totalTokens,
      tokenCountAfter: cumulativeTokens.totalTokens,
      optimizedMessages: messages,
    };
  }
}

/**
 * Check if summarization is needed based on cumulative tokens
 */
export function checkSummarizationNeeded(
  iterations: AdvancedChatIteration[],
  currentMessages: UIMessage[],
  systemPrompt: string,
  model?: ChatModel,
): boolean {
  const previousIterations = iterations.map((iter) => ({
    inputTokens: iter.inputTokens,
    outputTokens: iter.outputTokens,
  }));

  const cumulativeTokens = calculateCumulativeTokens(previousIterations);
  const currentEstimated = estimateTotalTokens(currentMessages, systemPrompt);
  cumulativeTokens.totalTokens += currentEstimated;

  const result = shouldSummarize(cumulativeTokens, model);
  return result.needed;
}
