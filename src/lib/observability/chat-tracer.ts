import logger from "logger";
import { generateUUID } from "lib/utils";
import type {
  ToolCallTrace,
  AdvancedChatIteration,
} from "@/types/advanced-chat";
import { LanguageModelUsage } from "ai";

export interface TraceContext {
  correlationId: string;
  jobId: string;
  iterationNumber?: number;
}

export class ChatTracer {
  private correlationId: string;
  private jobId: string;
  private iterationNumber?: number;

  constructor(correlationId: string, jobId: string, iterationNumber?: number) {
    this.correlationId = correlationId;
    this.jobId = jobId;
    this.iterationNumber = iterationNumber;
  }

  /**
   * Create a new tracer instance
   */
  static create(jobId: string, iterationNumber?: number): ChatTracer {
    const correlationId = generateUUID();
    return new ChatTracer(correlationId, jobId, iterationNumber);
  }

  /**
   * Create a tracer for a new iteration
   */
  forIteration(iterationNumber: number): ChatTracer {
    return new ChatTracer(this.correlationId, this.jobId, iterationNumber);
  }

  /**
   * Get trace context
   */
  getContext(): TraceContext {
    return {
      correlationId: this.correlationId,
      jobId: this.jobId,
      iterationNumber: this.iterationNumber,
    };
  }

  /**
   * Log job state transition
   */
  logStateTransition(
    from: string,
    to: string,
    metadata?: Record<string, unknown>,
  ): void {
    logger.info(
      `[${this.correlationId}] Job ${this.jobId} state transition: ${from} -> ${to}`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        from,
        to,
        ...metadata,
      },
    );
  }

  /**
   * Log iteration start
   */
  logIterationStart(metadata?: Record<string, unknown>): void {
    logger.info(
      `[${this.correlationId}] Iteration ${this.iterationNumber} started for job ${this.jobId}`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        iterationNumber: this.iterationNumber,
        ...metadata,
      },
    );
  }

  /**
   * Log iteration completion
   */
  logIterationComplete(
    usage: LanguageModelUsage | undefined,
    duration: number,
    metadata?: Record<string, unknown>,
  ): void {
    const usageAny = usage as any;
    logger.info(
      `[${this.correlationId}] Iteration ${this.iterationNumber} completed for job ${this.jobId}`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        iterationNumber: this.iterationNumber,
        inputTokens: usageAny?.promptTokens ?? usageAny?.inputTokens ?? 0,
        outputTokens: usageAny?.completionTokens ?? usageAny?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        duration,
        ...metadata,
      },
    );
  }

  /**
   * Log tool call start
   */
  logToolCallStart(toolCallId: string, toolName: string, input: unknown): void {
    logger.debug(
      `[${this.correlationId}] Tool call started: ${toolName} (${toolCallId})`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        iterationNumber: this.iterationNumber,
        toolCallId,
        toolName,
        input,
      },
    );
  }

  /**
   * Log tool call completion
   */
  logToolCallComplete(
    toolCallId: string,
    toolName: string,
    output: unknown,
    duration: number,
    error?: Error,
  ): void {
    const level = error ? "error" : "info";
    logger[level](
      `[${this.correlationId}] Tool call completed: ${toolName} (${toolCallId})`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        iterationNumber: this.iterationNumber,
        toolCallId,
        toolName,
        output: error ? undefined : output,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
        duration,
      },
    );
  }

  /**
   * Log context summarization
   */
  logContextSummarization(
    messagesSummarized: number,
    tokenCountBefore: number,
    tokenCountAfter: number,
  ): void {
    logger.info(
      `[${this.correlationId}] Context summarized: ${messagesSummarized} messages, tokens: ${tokenCountBefore} -> ${tokenCountAfter}`,
      {
        correlationId: this.correlationId,
        jobId: this.jobId,
        iterationNumber: this.iterationNumber,
        messagesSummarized,
        tokenCountBefore,
        tokenCountAfter,
      },
    );
  }

  /**
   * Log error
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    logger.error(`[${this.correlationId}] Error in job ${this.jobId}`, {
      correlationId: this.correlationId,
      jobId: this.jobId,
      iterationNumber: this.iterationNumber,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    });
  }

  /**
   * Log warning
   */
  logWarning(message: string, context?: Record<string, unknown>): void {
    logger.warn(`[${this.correlationId}] ${message}`, {
      correlationId: this.correlationId,
      jobId: this.jobId,
      iterationNumber: this.iterationNumber,
      ...context,
    });
  }

  /**
   * Log info message
   */
  logInfo(message: string, context?: Record<string, unknown>): void {
    logger.info(`[${this.correlationId}] ${message}`, {
      correlationId: this.correlationId,
      jobId: this.jobId,
      iterationNumber: this.iterationNumber,
      ...context,
    });
  }

  /**
   * Create tool call trace from execution
   */
  createToolCallTrace(
    toolCallId: string,
    toolName: string,
    input: unknown,
    output: unknown,
    startedAt: Date,
    completedAt: Date,
    error?: Error,
  ): ToolCallTrace {
    const duration = completedAt.getTime() - startedAt.getTime();

    return {
      toolCallId,
      toolName,
      input,
      output: error ? undefined : output,
      error: error?.message,
      duration,
      startedAt,
      completedAt,
    };
  }

  /**
   * Build trace data for iteration
   */
  buildIterationTrace(
    iteration: AdvancedChatIteration,
  ): Record<string, unknown> {
    return {
      correlationId: this.correlationId,
      jobId: this.jobId,
      iterationNumber: iteration.iterationNumber,
      inputTokens: iteration.inputTokens,
      outputTokens: iteration.outputTokens,
      totalTokens: iteration.totalTokens,
      toolCalls: iteration.toolCalls?.length ?? 0,
      duration: iteration.duration,
      error: iteration.error,
      startedAt: iteration.startedAt.toISOString(),
      completedAt: iteration.completedAt?.toISOString(),
    };
  }
}

/**
 * Create a tracer instance
 */
export function createTracer(
  correlationId: string,
  jobId: string,
  iterationNumber?: number,
): ChatTracer {
  return new ChatTracer(correlationId, jobId, iterationNumber);
}
