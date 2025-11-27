import { streamText, generateText, Tool } from "ai";
import { customModelProvider } from "lib/ai/models";
import { taskExecutionRepository } from "lib/db/repository";
import { TaskExecutionEntity } from "lib/db/pg/schema.pg";
import { nanoid } from "nanoid";
import globalLogger from "logger";
import { colorize } from "consola/utils";
import { z } from "zod";

const logger = globalLogger.withDefaults({
  message: colorize("cyan", `Task Orchestrator: `),
});

// Zod schema for validating LLM-generated task strategies
const SubTaskSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, "Step description cannot be empty"),
  type: z.enum(["tool-call", "llm-reasoning", "checkpoint"]),
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
  estimatedDuration: z.number().positive().optional(),
});

const TaskStrategySchema = z.object({
  steps: z.array(SubTaskSchema).min(1, "Strategy must have at least one step"),
  totalSteps: z.number().int().positive(),
});

export interface TaskContext {
  summary?: string;
  findings?: Record<string, any>;
  toolResults?: Array<{ toolName: string; result: any }>;
  messageHistory?: Array<{ role: string; content: string }>;
}

export interface SubTask {
  id: string;
  description: string;
  type: "tool-call" | "llm-reasoning" | "checkpoint";
  status: "pending" | "running" | "completed" | "failed";
  estimatedDuration?: number;
}

export interface TaskStrategy {
  steps: SubTask[];
  totalSteps: number;
}

export interface OrchestratorConfig {
  chatModel: {
    provider: string;
    model: string;
  };
  maxSteps?: number;
  contextWindowLimit?: number;
  checkpointInterval?: number; // Steps between checkpoints
}

export class TaskOrchestrator {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = {
      maxSteps: 50,
      contextWindowLimit: 100000, // tokens
      checkpointInterval: 5,
      ...config,
    };
  }

  /**
   * Analyzes a user request to determine if it should be orchestrated
   * as a long-running task vs. handled as a single request
   */
  async shouldOrchestrate(message: string, context?: any): Promise<boolean> {
    try {
      const model = customModelProvider.getModel(this.config.chatModel);

      const systemPrompt = `You are an AI task analyzer. Determine if a user request requires orchestration as a long-running, multi-step task.

A task SHOULD be orchestrated if it:
1. Requires multiple sequential tool calls (>5 calls)
2. Involves processing large datasets or many items
3. Has steps that depend on previous results
4. Could take longer than 2 minutes to complete
5. Might exceed context window limits
6. Requires iterative refinement or loops
7. Involves complex workflows (e.g., "analyze all files", "migrate X to Y", "create reports for all...")

A task should NOT be orchestrated if it:
1. Is a simple question or query
2. Requires only 1-2 tool calls
3. Can complete in under 1 minute
4. Is primarily conversational

Respond with ONLY "YES" or "NO".`;

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `User request: "${message}"\n\nShould this be orchestrated?`,
        maxTokens: 10,
      });

      const shouldOrchestrate = result.text.trim().toUpperCase().includes("YES");
      logger.info(
        `Orchestration decision for "${message.substring(0, 50)}...": ${shouldOrchestrate}`,
      );

      return shouldOrchestrate;
    } catch (error) {
      logger.error("Error in shouldOrchestrate:", error);
      // Default to false on error
      return false;
    }
  }

  /**
   * Decomposes a high-level goal into concrete subtasks
   */
  async decomposeGoal(
    goal: string,
    availableTools: Record<string, Tool>,
    context?: any,
  ): Promise<TaskStrategy> {
    try {
      const model = customModelProvider.getModel(this.config.chatModel);

      const toolList = Object.keys(availableTools)
        .map((name) => `- ${name}`)
        .join("\n");

      const systemPrompt = `You are a task planning AI. Break down complex goals into concrete, actionable subtasks.

Available tools:
${toolList}

Rules:
1. Each subtask should be specific and measurable
2. Use "tool-call" type for steps requiring tool execution
3. Use "llm-reasoning" type for analysis, summarization, or decision-making
4. Use "checkpoint" type before context-heavy operations
5. Steps should be sequential and build on each other
6. Be realistic about what can be accomplished
7. Maximum ${this.config.maxSteps} steps

Respond in JSON format:
{
  "steps": [
    {
      "id": "step-1",
      "description": "Specific action to take",
      "type": "tool-call" | "llm-reasoning" | "checkpoint",
      "estimatedDuration": 30000
    }
  ],
  "totalSteps": 5
}`;

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Goal: "${goal}"\n${context ? `\nContext: ${JSON.stringify(context)}` : ""}\n\nBreak this down into subtasks:`,
        maxTokens: 2000,
      });

      // Parse and validate the LLM output
      let parsed: any;
      try {
        parsed = JSON.parse(result.text);
      } catch (parseError) {
        logger.error("Failed to parse LLM output as JSON:", {
          text: result.text.substring(0, 200),
          error: parseError,
        });
        throw new Error("LLM returned invalid JSON");
      }

      // Validate with Zod schema
      const validationResult = TaskStrategySchema.safeParse(parsed);
      if (!validationResult.success) {
        logger.error("LLM output failed schema validation:", {
          text: result.text.substring(0, 200),
          errors: validationResult.error.errors,
        });
        // Fall back to single-step strategy
        throw new Error("LLM returned invalid task strategy structure");
      }

      const strategy = validationResult.data as TaskStrategy;

      // Add IDs and default status if not present
      strategy.steps = strategy.steps.map((step, idx) => ({
        ...step,
        id: step.id || `step-${idx + 1}`,
        status: step.status || "pending",
      }));

      strategy.totalSteps = strategy.steps.length;

      logger.info(
        `Decomposed goal into ${strategy.totalSteps} steps: ${strategy.steps.map((s) => s.description).join(" -> ")}`,
      );

      return strategy;
    } catch (error) {
      logger.error("Error in decomposeGoal:", error);
      // Return a simple single-step strategy as fallback
      return {
        steps: [
          {
            id: "step-1",
            description: goal,
            type: "llm-reasoning",
            status: "pending",
          },
        ],
        totalSteps: 1,
      };
    }
  }

  /**
   * Evaluates task progress and determines if continuation is needed
   */
  async evaluateProgress(
    task: TaskExecutionEntity,
  ): Promise<{ shouldContinue: boolean; reason: string }> {
    const currentStepNum = parseInt(task.currentStep, 10);
    const totalSteps = task.strategy?.totalSteps || 0;

    // Check if all steps completed
    if (currentStepNum >= totalSteps) {
      return { shouldContinue: false, reason: "All steps completed" };
    }

    // Check if task failed
    if (task.status === "failed") {
      return { shouldContinue: false, reason: "Task failed" };
    }

    // Check retry limit
    const retryCount = parseInt(task.retryCount, 10);
    if (retryCount > 5) {
      return {
        shouldContinue: false,
        reason: "Maximum retry count exceeded",
      };
    }

    return { shouldContinue: true, reason: "More steps to execute" };
  }

  /**
   * Determines the next action to take for a task
   */
  async selectNextAction(
    task: TaskExecutionEntity,
  ): Promise<{ action: string; stepId: string; description: string } | null> {
    if (!task.strategy) {
      return null;
    }

    const currentStepNum = parseInt(task.currentStep, 10);

    // Find the next pending step
    const nextStep = task.strategy.steps[currentStepNum];

    if (!nextStep) {
      return null;
    }

    return {
      action: nextStep.type,
      stepId: nextStep.id,
      description: nextStep.description,
    };
  }

  /**
   * Summarizes conversation history to compress context
   */
  async summarizeContext(
    taskId: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    try {
      const model = customModelProvider.getModel(this.config.chatModel);

      const systemPrompt = `You are a context summarization AI. Create a concise summary of the conversation that preserves:
1. Key decisions made
2. Important findings or results
3. Current progress state
4. Critical context needed for next steps

Be extremely concise but complete. Maximum 500 words.`;

      const conversationText = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: `Summarize this conversation:\n\n${conversationText}`,
        maxTokens: 1000,
      });

      logger.info(`Summarized ${messages.length} messages for task ${taskId}`);

      return result.text;
    } catch (error) {
      logger.error("Error in summarizeContext:", error);
      return "Summary unavailable due to error.";
    }
  }

  /**
   * Creates a checkpoint for resumable execution
   */
  async createCheckpoint(
    taskId: string,
    step: number,
    context: TaskContext,
  ): Promise<void> {
    const checkpoint = {
      id: nanoid(),
      step,
      timestamp: new Date().toISOString(),
      context,
      summary:
        context.summary ||
        `Checkpoint at step ${step}: ${context.toolResults?.length || 0} tool results captured`,
    };

    await taskExecutionRepository.saveCheckpoint(taskId, checkpoint);

    // Add trace
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      traceType: "checkpoint",
      message: checkpoint.summary,
      metadata: { step, checkpointId: checkpoint.id },
    });

    logger.info(`Created checkpoint for task ${taskId} at step ${step}`);
  }

  /**
   * Restores task execution state from a checkpoint
   */
  async restoreFromCheckpoint(taskId: string): Promise<TaskContext | null> {
    const checkpoint = await taskExecutionRepository.getLatestCheckpoint(taskId);

    if (!checkpoint) {
      return null;
    }

    logger.info(
      `Restored task ${taskId} from checkpoint at step ${checkpoint.step}`,
    );

    return checkpoint.context;
  }

  /**
   * Handles tool execution failures with recovery strategies
   */
  async handleToolFailure(
    taskId: string,
    toolName: string,
    error: Error,
    attemptNumber: number,
  ): Promise<{ shouldRetry: boolean; delay?: number; reason: string }> {
    const task = await taskExecutionRepository.getTaskExecution(taskId);

    if (!task) {
      return { shouldRetry: false, reason: "Task not found" };
    }

    // Log the failure
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      traceType: "error",
      message: `Tool ${toolName} failed: ${error.message}`,
      metadata: { toolName, attemptNumber, error: error.stack },
    });

    // Retry logic
    if (attemptNumber < 3) {
      const delay = Math.pow(2, attemptNumber) * 1000; // Exponential backoff
      logger.warn(
        `Tool ${toolName} failed (attempt ${attemptNumber}), retrying in ${delay}ms`,
      );

      return {
        shouldRetry: true,
        delay,
        reason: "Transient failure, retrying with backoff",
      };
    }

    // Update retry count
    const retryCount = parseInt(task.retryCount, 10) + 1;
    await taskExecutionRepository.updateTaskExecution(taskId, {
      retryCount: retryCount.toString(),
    });

    logger.error(
      `Tool ${toolName} failed after ${attemptNumber} attempts, moving to next step`,
    );

    return {
      shouldRetry: false,
      reason: "Max retries exceeded, skipping step",
    };
  }

  /**
   * Estimates remaining time for task completion
   */
  estimateCompletionTime(task: TaskExecutionEntity): Date | null {
    if (!task.strategy) {
      return null;
    }

    const currentStepNum = parseInt(task.currentStep, 10);
    const remainingSteps = task.strategy.steps.slice(currentStepNum);

    const estimatedMs = remainingSteps.reduce(
      (sum, step) => sum + (step.estimatedDuration || 30000),
      0,
    );

    const completionDate = new Date(Date.now() + estimatedMs);
    return completionDate;
  }

  /**
   * Checks if context window limit is approaching
   */
  shouldSummarizeContext(
    currentTokenCount: number,
    threshold = 0.8,
  ): boolean {
    const limit = this.config.contextWindowLimit || 100000;
    return currentTokenCount > limit * threshold;
  }

  /**
   * Gets a human-readable status summary for a task
   */
  getTaskSummary(task: TaskExecutionEntity): string {
    const currentStepNum = parseInt(task.currentStep, 10);
    const totalSteps = task.strategy?.totalSteps || 0;
    const progress = totalSteps > 0 ? (currentStepNum / totalSteps) * 100 : 0;

    const currentStep = task.strategy?.steps[currentStepNum];

    return `Task ${task.id}: ${task.status} (${progress.toFixed(0)}% complete - step ${currentStepNum + 1}/${totalSteps}${currentStep ? `: ${currentStep.description}` : ""})`;
  }
}
