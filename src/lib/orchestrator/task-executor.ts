import { streamText, generateText, Tool } from "ai";
import { customModelProvider } from "lib/ai/models";
import { taskExecutionRepository, chatRepository } from "lib/db/repository";
import { TaskExecutionEntity } from "lib/db/pg/schema.pg";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import {
  loadMcpTools,
  loadWorkFlowTools,
  loadAppDefaultTools,
} from "app/api/chat/shared.chat";
import logger from "logger";
import { colorize } from "consola/utils";
import { nanoid } from "nanoid";

const executorLogger = logger.withDefaults({
  message: colorize("yellow", `Task Executor: `),
});

export interface ExecuteTaskStepParams {
  taskId: string;
  userId: string;
  threadId: string;
  stepIndex: number;
  stepDescription: string;
  stepType: "tool-call" | "llm-reasoning" | "checkpoint" | "summarization";
  task: TaskExecutionEntity;
}

export interface StepExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Executes a single task step
 */
export async function executeTaskStep(
  params: ExecuteTaskStepParams,
): Promise<StepExecutionResult> {
  const { taskId, userId, threadId, stepIndex, stepDescription, stepType, task } =
    params;

  executorLogger.info(
    `Executing step ${stepIndex} for task ${taskId}: ${stepDescription}`,
  );

  const startTime = Date.now();

  // Create step record
  const step = await taskExecutionRepository.createTaskStep({
    taskExecutionId: taskId,
    stepIndex: stepIndex.toString(),
    description: stepDescription,
    type: stepType,
    status: "running",
    startedAt: new Date(),
  });

  // Add trace
  await taskExecutionRepository.addTrace({
    taskExecutionId: taskId,
    stepId: step.id,
    traceType: "decision",
    message: `Starting step ${stepIndex}: ${stepDescription}`,
    metadata: { stepType },
  });

  try {
    let result: StepExecutionResult;

    switch (stepType) {
      case "llm-reasoning":
        result = await executeLLMReasoning(params);
        break;

      case "tool-call":
        result = await executeToolCall(params);
        break;

      case "checkpoint":
        result = await createCheckpoint(params);
        break;

      case "summarization":
        result = await executeSummarization(params);
        break;

      default:
        throw new Error(`Unknown step type: ${stepType}`);
    }

    // Update step as completed
    const duration = Date.now() - startTime;
    await taskExecutionRepository.updateTaskStep(step.id, {
      status: "completed",
      output: result.output,
      tokenUsage: result.tokenUsage,
      completedAt: new Date(),
      duration: duration.toString(),
    });

    // Add trace
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      stepId: step.id,
      traceType: stepType === "tool-call" ? "tool-call" : "llm-response",
      message: `Completed step ${stepIndex}: ${stepDescription}`,
      metadata: { duration, result: result.output },
    });

    executorLogger.info(
      `Step ${stepIndex} completed in ${duration}ms for task ${taskId}`,
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Update step as failed
    await taskExecutionRepository.updateTaskStep(step.id, {
      status: "failed",
      error: errorMessage,
      completedAt: new Date(),
      duration: duration.toString(),
    });

    // Add error trace
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      stepId: step.id,
      traceType: "error",
      message: `Step ${stepIndex} failed: ${errorMessage}`,
      metadata: { duration, error: String(error) },
    });

    executorLogger.error(`Step ${stepIndex} failed for task ${taskId}:`, error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Executes LLM reasoning step
 */
async function executeLLMReasoning(
  params: ExecuteTaskStepParams,
): Promise<StepExecutionResult> {
  const { task, stepDescription, threadId } = params;

  const model = customModelProvider.getModel(
    task.chatModel || {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    },
  );

  // Get conversation history
  const thread = await chatRepository.selectThreadDetails(threadId);
  const messages =
    thread?.messages?.map((m) => ({
      role: m.role,
      content: JSON.stringify(m.parts),
    })) || [];

  // Add task context
  const contextPrompt = task.context?.summary
    ? `\n\nTask context: ${task.context.summary}`
    : "";

  const systemPrompt = `You are executing a specific step in a larger task orchestration.

Task Goal: ${task.goal}

Current Step: ${stepDescription}

${contextPrompt}

Focus on completing just this step. Be concise but thorough.`;

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: messages.slice(-10), // Last 10 messages for context
    maxTokens: 4000,
  });

  // Save result to task context
  const updatedContext = {
    ...task.context,
    findings: {
      ...(task.context?.findings || {}),
      [stepDescription]: result.text,
    },
  };

  await taskExecutionRepository.updateContext(task.id, updatedContext);

  return {
    success: true,
    output: result.text,
    tokenUsage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

/**
 * Executes tool call step
 */
async function executeToolCall(
  params: ExecuteTaskStepParams,
): Promise<StepExecutionResult> {
  const { task, stepDescription, threadId, taskId } = params;

  const model = customModelProvider.getModel(
    task.chatModel || {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    },
  );

  // Load available tools
  const mcpTools = await loadMcpTools({
    mentions: task.mentions || [],
    allowedMcpServers: task.allowedMcpServers || {},
  });

  const workflowTools = await loadWorkFlowTools({
    mentions: task.mentions || [],
    dataStream: null as any, // Not using streaming for background tasks
  });

  const appDefaultTools = await loadAppDefaultTools({
    mentions: task.mentions || [],
    allowedAppDefaultToolkit: task.allowedAppDefaultToolkit || [],
  });

  const tools = {
    ...mcpTools,
    ...workflowTools,
    ...appDefaultTools,
  };

  // Get conversation history
  const thread = await chatRepository.selectThreadDetails(threadId);
  const messages =
    thread?.messages?.map((m) => ({
      role: m.role,
      content: JSON.stringify(m.parts),
    })) || [];

  const contextPrompt = task.context?.summary
    ? `\n\nTask context: ${task.context.summary}`
    : "";

  const systemPrompt = `You are executing a specific step in a larger task orchestration that requires tool usage.

Task Goal: ${task.goal}

Current Step: ${stepDescription}

${contextPrompt}

Use the available tools to complete this step. Be efficient and purposeful with tool calls.`;

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: messages.slice(-10),
    tools,
    maxToolRoundtrips: 5,
    maxTokens: 4000,
  });

  // Record tool calls in history
  const toolCalls = result.toolCalls || [];
  for (const toolCall of toolCalls) {
    await taskExecutionRepository.appendToolCallHistory(taskId, {
      toolName: toolCall.toolName,
      args: toolCall.args,
      result: result.toolResults?.find((r) => r.toolCallId === toolCall.toolCallId)
        ?.result,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    // Add trace for each tool call
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      traceType: "tool-call",
      message: `Called tool: ${toolCall.toolName}`,
      metadata: {
        args: toolCall.args,
        result: result.toolResults?.find(
          (r) => r.toolCallId === toolCall.toolCallId,
        )?.result,
      },
    });
  }

  // Update task context with tool results
  const updatedContext = {
    ...task.context,
    toolResults: [
      ...(task.context?.toolResults || []),
      ...toolCalls.map((tc) => ({
        toolName: tc.toolName,
        result: result.toolResults?.find((r) => r.toolCallId === tc.toolCallId)
          ?.result,
      })),
    ],
  };

  await taskExecutionRepository.updateContext(task.id, updatedContext);

  return {
    success: true,
    output: {
      text: result.text,
      toolCalls: toolCalls.length,
      toolResults: result.toolResults,
    },
    tokenUsage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

/**
 * Creates a checkpoint
 */
async function createCheckpoint(
  params: ExecuteTaskStepParams,
): Promise<StepExecutionResult> {
  const { task, stepIndex, taskId } = params;

  const checkpoint = {
    id: nanoid(),
    step: stepIndex,
    timestamp: new Date().toISOString(),
    context: task.context || {},
    summary: `Checkpoint at step ${stepIndex}`,
  };

  await taskExecutionRepository.saveCheckpoint(taskId, checkpoint);

  return {
    success: true,
    output: checkpoint,
  };
}

/**
 * Executes context summarization
 */
async function executeSummarization(
  params: ExecuteTaskStepParams,
): Promise<StepExecutionResult> {
  const { task, threadId, taskId } = params;

  const model = customModelProvider.getModel(
    task.chatModel || {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    },
  );

  // Get conversation history
  const thread = await chatRepository.selectThreadDetails(threadId);
  const messages =
    thread?.messages?.map((m) => ({
      role: m.role,
      content: JSON.stringify(m.parts),
    })) || [];

  const systemPrompt = `You are summarizing progress in a long-running task orchestration.

Task Goal: ${task.goal}

Create a concise summary that includes:
1. Key decisions made
2. Important findings or results
3. Current progress state
4. Critical context needed for next steps

Maximum 500 words.`;

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: `Summarize the progress:\n\n${conversationText}`,
    maxTokens: 1000,
  });

  // Update task context with summary
  const updatedContext = {
    ...task.context,
    summary: result.text,
  };

  await taskExecutionRepository.updateContext(taskId, updatedContext);

  return {
    success: true,
    output: result.text,
    tokenUsage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}
