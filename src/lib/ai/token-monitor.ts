import type { LanguageModelUsage } from "ai";
import type { ChatModel } from "@/types/chat";
import logger from "logger";

// Model-specific context window limits (in tokens)
// These are approximate and may vary by provider
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4": 8192,
  "gpt-4-turbo": 128000,
  "gpt-4o": 128000,
  "gpt-3.5-turbo": 16385,
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-3-5-sonnet": 200000,
  "gemini-pro": 32768,
  "gemini-1.5-pro": 2097152,
  "gemini-1.5-flash": 1048576,
};

// Default context window if model not found
const DEFAULT_CONTEXT_WINDOW = 128000;

// Proactive summarization threshold (80% of context window)
const SUMMARIZATION_THRESHOLD_RATIO = 0.8;

export interface TokenCount {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CumulativeTokenCount {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  iterations: number;
}

/**
 * Get context window limit for a model
 */
export function getContextWindowLimit(model?: ChatModel): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW;

  const modelKey = `${model.provider}/${model.model}`;
  const specificLimit = MODEL_CONTEXT_LIMITS[modelKey];
  if (specificLimit) return specificLimit;

  // Try provider-specific defaults
  const providerDefaults: Record<string, number> = {
    openai: 128000,
    anthropic: 200000,
    google: 1048576,
    groq: 32768,
  };

  return providerDefaults[model.provider] || DEFAULT_CONTEXT_WINDOW;
}

/**
 * Extract token count from AI SDK usage object
 */
export function extractTokenCount(
  usage: LanguageModelUsage | undefined,
): TokenCount {
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  return {
    inputTokens: (usage as any).promptTokens ?? (usage as any).inputTokens ?? 0,
    outputTokens:
      (usage as any).completionTokens ?? (usage as any).outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/**
 * Calculate cumulative token count across iterations
 */
export function calculateCumulativeTokens(
  iterations: Array<{ inputTokens: number; outputTokens: number }>,
): CumulativeTokenCount {
  const cumulative = iterations.reduce(
    (acc, iter) => ({
      totalInputTokens: acc.totalInputTokens + iter.inputTokens,
      totalOutputTokens: acc.totalOutputTokens + iter.outputTokens,
      totalTokens: acc.totalTokens + iter.inputTokens + iter.outputTokens,
      iterations: acc.iterations + 1,
    }),
    {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      iterations: 0,
    },
  );

  return cumulative;
}

/**
 * Check if summarization is needed based on token count
 */
export function shouldSummarize(
  cumulativeTokens: CumulativeTokenCount,
  model?: ChatModel,
): {
  needed: boolean;
  reason: "proactive" | "reactive" | null;
  threshold: number;
  current: number;
} {
  const contextLimit = getContextWindowLimit(model);
  const threshold = Math.floor(contextLimit * SUMMARIZATION_THRESHOLD_RATIO);
  const current = cumulativeTokens.totalTokens;

  // Proactive: approaching limit
  if (current >= threshold) {
    return {
      needed: true,
      reason: "proactive",
      threshold,
      current,
    };
  }

  return {
    needed: false,
    reason: null,
    threshold,
    current,
  };
}

/**
 * Estimate tokens for a message (rough approximation)
 * Uses a simple heuristic: ~4 characters per token for English text
 */
export function estimateMessageTokens(message: {
  role: string;
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}): number {
  let tokenCount = 0;

  // Base tokens for role and structure
  tokenCount += 3;

  for (const part of message.parts) {
    if (part.type === "text" && part.text) {
      // Rough estimate: 4 characters per token
      tokenCount += Math.ceil(part.text.length / 4);
    } else if (part.type === "tool-call" || part.type === "tool-result") {
      // Tool calls/results have overhead
      tokenCount += 50; // Base overhead
      if (part.input) {
        const inputStr = JSON.stringify(part.input);
        tokenCount += Math.ceil(inputStr.length / 4);
      }
      if (part.output) {
        const outputStr = JSON.stringify(part.output);
        tokenCount += Math.ceil(outputStr.length / 4);
      }
    } else if (part.type === "file" || part.type === "source-url") {
      // File attachments have metadata overhead
      tokenCount += 20;
    }
  }

  return tokenCount;
}

/**
 * Estimate total tokens for a message array
 */
export function estimateTotalTokens(
  messages: Array<{
    role: string;
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
  }>,
  systemPrompt?: string,
): number {
  let total = 0;

  if (systemPrompt) {
    total += Math.ceil(systemPrompt.length / 4);
  }

  for (const message of messages) {
    total += estimateMessageTokens(message);
  }

  return total;
}

/**
 * Check if context window is exceeded (reactive check)
 */
export function isContextExceeded(
  error: Error | unknown,
  cumulativeTokens: CumulativeTokenCount,
  model?: ChatModel,
): boolean {
  const contextLimit = getContextWindowLimit(model);

  // Check error message for context-related errors
  if (error instanceof Error) {
    const errorMsg = error.message.toLowerCase();
    if (
      errorMsg.includes("context length") ||
      errorMsg.includes("token limit") ||
      errorMsg.includes("maximum context") ||
      errorMsg.includes("context window")
    ) {
      logger.warn(
        `Context exceeded error detected: ${errorMsg}, cumulative tokens: ${cumulativeTokens.totalTokens}`,
      );
      return true;
    }
  }

  // Also check if we're over the limit
  if (cumulativeTokens.totalTokens >= contextLimit) {
    logger.warn(
      `Cumulative tokens (${cumulativeTokens.totalTokens}) exceed context limit (${contextLimit})`,
    );
    return true;
  }

  return false;
}
