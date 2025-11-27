import { getSession } from "auth/server";
import { taskExecutionRepository, chatRepository } from "lib/db/repository";
import { TaskOrchestrator } from "lib/orchestrator/task-orchestrator";
import { queueTaskStep, cancelJob } from "lib/orchestrator/task-queue";
import {
  loadMcpTools,
  loadWorkFlowTools,
  loadAppDefaultTools,
} from "app/api/chat/shared.chat";
import globalLogger from "logger";
import { colorize } from "consola/utils";
import { NextRequest } from "next/server";

const logger = globalLogger.withDefaults({
  message: colorize("blue", `Orchestrate API: `),
});

export const maxDuration = 300;

interface OrchestrateRequest {
  goal: string;
  threadId: string;
  chatModel?: {
    provider: string;
    model: string;
  };
  mentions?: any[];
  allowedMcpServers?: Record<string, any>;
  allowedAppDefaultToolkit?: string[];
  agentId?: string;
}

/**
 * POST /api/chat/orchestrate
 * Creates a new orchestrated task execution
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get("Authorization");
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;
    let userId: string | undefined;

    if (authHeader?.startsWith("Bearer ") && apiKey) {
      const providedKey = authHeader.substring(7);
      if (providedKey === apiKey) {
        // Use configured system user ID from environment variable or require session auth
        const systemUserId = process.env.SYSTEM_USER_ID;
        if (!systemUserId) {
          return Response.json(
            { error: "System user not configured. Please set SYSTEM_USER_ID environment variable or use session authentication." },
            { status: 500 }
          );
        }
        userId = systemUserId;
        logger.info("Request authenticated via API key");
      } else {
        return Response.json({ error: "Invalid API key" }, { status: 401 });
      }
    } else {
      const session = await getSession();
      if (!session?.user.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    const body: OrchestrateRequest = await request.json();
    const {
      goal,
      threadId,
      chatModel,
      mentions = [],
      allowedMcpServers = {},
      allowedAppDefaultToolkit = [],
      agentId,
    } = body;

    if (!goal || !threadId) {
      return Response.json(
        { error: "Missing required fields: goal, threadId" },
        { status: 400 },
      );
    }

    // Verify thread ownership
    let thread = await chatRepository.selectThreadDetails(threadId);

    if (!thread) {
      logger.info(`Creating new chat thread: ${threadId}`);
      const newThread = await chatRepository.insertThread({
        id: threadId,
        title: goal.substring(0, 100),
        userId: userId!,
      });
      thread = await chatRepository.selectThreadDetails(newThread.id);
    }

    if (thread!.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create orchestrator
    const orchestrator = new TaskOrchestrator({
      chatModel: chatModel || {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
      },
    });

    // Load available tools for decomposition in parallel
    const [mcpTools, workflowTools, appDefaultTools] = await Promise.all([
      loadMcpTools({
        mentions,
        allowedMcpServers,
      }),
      loadWorkFlowTools({
        mentions,
        dataStream: null as any,
      }),
      loadAppDefaultTools({
        mentions,
        allowedAppDefaultToolkit,
      }),
    ]);

    // Validate no tool name collisions
    const allToolNames = [
      ...Object.keys(mcpTools),
      ...Object.keys(workflowTools),
      ...Object.keys(appDefaultTools),
    ];
    const duplicates = allToolNames.filter(
      (name, i) => allToolNames.indexOf(name) !== i
    );
    if (duplicates.length > 0) {
      logger.error(`Duplicate tool names detected: ${duplicates.join(", ")}`);
      return Response.json(
        { error: `Tool name collision detected: ${duplicates.join(", ")}` },
        { status: 500 }
      );
    }

    const tools = {
      ...mcpTools,
      ...workflowTools,
      ...appDefaultTools,
    };

    // Decompose goal into strategy
    logger.info(`Decomposing goal: ${goal}`);
    const strategy = await orchestrator.decomposeGoal(goal, tools);

    // Create task execution record
    const task = await taskExecutionRepository.createTaskExecution({
      userId: userId!,
      threadId: threadId,
      status: "pending",
      goal,
      strategy,
      currentStep: "0",
      context: {
        summary: `Task started: ${goal}`,
        findings: {},
        toolResults: [],
        messageHistory: [],
      },
      toolCallHistory: [],
      checkpoints: [],
      retryCount: "0",
      chatModel,
      mentions,
      allowedMcpServers,
      allowedAppDefaultToolkit,
      agentId,
      estimatedCompletion: orchestrator.estimateCompletionTime({
        strategy,
        currentStep: "0",
      } as any),
    });

    // Add initial trace
    await taskExecutionRepository.addTrace({
      taskExecutionId: task.id,
      traceType: "decision",
      message: `Task created with ${strategy.totalSteps} steps`,
      metadata: { goal, strategy },
    });

    // Queue first step
    logger.info(`Queuing first step for task ${task.id}`);
    await queueTaskStep({
      taskId: task.id,
      userId: userId!,
      threadId: threadId,
      stepIndex: 0,
    });

    logger.info(`Task ${task.id} created and queued successfully`);

    return Response.json({
      taskId: task.id,
      status: "queued",
      strategy,
      estimatedDuration:
        strategy.steps.reduce(
          (sum, step) => sum + (step.estimatedDuration || 30000),
          0,
        ) / 1000,
      message: `Task queued for execution. ${strategy.totalSteps} steps planned.`,
    });
  } catch (error: any) {
    logger.error("Error in orchestrate API:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/chat/orchestrate?taskId=xxx
 * Gets the status of an orchestrated task
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get("Authorization");
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;
    let userId: string | undefined;

    if (authHeader?.startsWith("Bearer ") && apiKey) {
      const providedKey = authHeader.substring(7);
      if (providedKey === apiKey) {
        // Use configured system user ID from environment variable
        const systemUserId = process.env.SYSTEM_USER_ID;
        if (!systemUserId) {
          return Response.json(
            { error: "System user not configured" },
            { status: 500 }
          );
        }
        userId = systemUserId;
      } else {
        return Response.json({ error: "Invalid API key" }, { status: 401 });
      }
    } else {
      const session = await getSession();
      if (!session?.user.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return Response.json(
        { error: "Missing taskId parameter" },
        { status: 400 },
      );
    }

    const task = await taskExecutionRepository.getTaskExecution(taskId);

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // Verify ownership
    if (task.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get steps and traces
    const steps = await taskExecutionRepository.listTaskSteps(taskId);
    const traces = await taskExecutionRepository.listTaskTraces(taskId, 50);

    const currentStepNum = parseInt(task.currentStep, 10);
    const totalSteps = task.strategy?.totalSteps || 0;
    const progress = totalSteps > 0 ? (currentStepNum / totalSteps) * 100 : 0;

    return Response.json({
      taskId: task.id,
      status: task.status,
      goal: task.goal,
      progress: Math.round(progress),
      currentStep: currentStepNum + 1,
      totalSteps,
      steps: steps.map((s) => ({
        index: s.stepIndex,
        description: s.description,
        type: s.type,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        duration: s.duration,
      })),
      latestTraces: traces.slice(-10).map((t) => ({
        type: t.traceType,
        message: t.message,
        timestamp: t.timestamp,
      })),
      context: task.context,
      lastError: task.lastError,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    });
  } catch (error: any) {
    logger.error("Error getting task status:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/chat/orchestrate?taskId=xxx
 * Cancels a running task
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get("Authorization");
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;
    let userId: string | undefined;

    if (authHeader?.startsWith("Bearer ") && apiKey) {
      const providedKey = authHeader.substring(7);
      if (providedKey === apiKey) {
        const systemUserId = process.env.SYSTEM_USER_ID;
        if (!systemUserId) {
          return Response.json(
            { error: "System user not configured" },
            { status: 500 }
          );
        }
        userId = systemUserId;
      } else {
        return Response.json({ error: "Invalid API key" }, { status: 401 });
      }
    } else {
      const session = await getSession();
      if (!session?.user.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return Response.json(
        { error: "Missing taskId parameter" },
        { status: 400 },
      );
    }

    const task = await taskExecutionRepository.getTaskExecution(taskId);

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // Verify ownership
    if (task.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Can only cancel pending or running tasks
    if (task.status !== "pending" && task.status !== "running") {
      return Response.json(
        { error: `Cannot cancel task with status: ${task.status}` },
        { status: 400 }
      );
    }

    // Cancel the job in the queue
    try {
      await cancelJob(taskId);
      logger.info(`Cancelled queue job for task ${taskId}`);
    } catch (error) {
      logger.warn(`Failed to cancel queue job for task ${taskId}:`, error);
      // Continue anyway to update task status
    }

    // Update task status
    await taskExecutionRepository.updateTaskExecution(taskId, {
      status: "failed",
      lastError: "Task cancelled by user",
      completedAt: new Date(),
    });

    // Add trace
    await taskExecutionRepository.addTrace({
      taskExecutionId: taskId,
      traceType: "decision",
      message: "Task cancelled by user",
      metadata: { cancelledBy: userId },
    });

    logger.info(`Task ${taskId} cancelled successfully`);

    return Response.json({
      taskId,
      status: "cancelled",
      message: "Task cancelled successfully",
    });
  } catch (error: any) {
    logger.error("Error cancelling task:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
