import { advancedChatRepository } from "@/lib/db/repository";
import { advancedChatQueue } from "@/lib/scheduler/advanced-chat-queue";
import { getSession } from "auth/server";
import { validateApiKeyFromHeader } from "@/lib/auth/api-key-auth";
import logger from "logger";
import { colorize } from "consola/utils";
import globalLogger from "logger";

const loggerAdvanced = globalLogger.withDefaults({
  message: colorize("blackBright", `Advanced Chat API: `),
});

/**
 * GET /api/chat/advanced/[jobId]
 * Get job status and details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    // Authentication
    let userId: string | undefined;
    const session = await getSession();
    if (session?.user.id) {
      userId = session.user.id;
    } else {
      const apiKeyAuth = await validateApiKeyFromHeader(request);
      if (apiKeyAuth) {
        userId = apiKeyAuth.userId;
      } else {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Load job
    const job = await advancedChatRepository.selectJob(jobId, userId);
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    // Load iterations
    const iterations =
      await advancedChatRepository.selectIterationsByJobId(jobId);

    // Load context summaries
    const summaries =
      await advancedChatRepository.selectContextSummariesByJobId(jobId);

    return Response.json({
      job,
      iterations,
      summaries,
    });
  } catch (error: any) {
    loggerAdvanced.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}

/**
 * POST /api/chat/advanced/[jobId]/resume
 * Resume a paused or failed job
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const { action } = await request.json().catch(() => ({}));

    // Authentication
    let userId: string | undefined;
    const session = await getSession();
    if (session?.user.id) {
      userId = session.user.id;
    } else {
      const apiKeyAuth = await validateApiKeyFromHeader(request);
      if (apiKeyAuth) {
        userId = apiKeyAuth.userId;
      } else {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Load job
    const job = await advancedChatRepository.selectJob(jobId, userId);
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    if (action === "resume") {
      // Only resume if paused or failed
      if (job.status !== "paused" && job.status !== "failed") {
        return Response.json(
          { message: `Cannot resume job with status: ${job.status}` },
          { status: 400 },
        );
      }

      // Update job status to pending
      await advancedChatRepository.updateJob(jobId, {
        status: "pending",
      });

      // Re-add to queue
      const jobData = {
        jobId,
        threadId: job.threadId,
        userId: job.userId,
        message: {} as any, // Will be loaded from thread
        chatModel: job.metadata.chatModel,
        toolChoice: job.metadata.toolChoice || "auto",
        mentions: job.metadata.mentions || [],
        allowedMcpServers: job.metadata.allowedMcpServers,
        allowedAppDefaultToolkit: job.metadata.allowedAppDefaultToolkit,
        imageTool: job.metadata.imageTool,
        attachments: [],
        correlationId: job.correlationId,
      };

      await advancedChatQueue.add(`advanced-chat-${jobId}`, jobData, {
        jobId: jobId,
        priority: 1,
      });

      loggerAdvanced.info(`Resumed job ${jobId}`);

      return Response.json({
        success: true,
        message: "Job resumed",
        jobId,
      });
    } else if (action === "cancel") {
      // Cancel running job
      if (job.status !== "running" && job.status !== "pending") {
        return Response.json(
          { message: `Cannot cancel job with status: ${job.status}` },
          { status: 400 },
        );
      }

      // Remove from queue if pending
      if (job.status === "pending") {
        const bullJob = await advancedChatQueue.getJob(jobId);
        if (bullJob) {
          await bullJob.remove();
        }
      }

      // Update job status
      await advancedChatRepository.updateJob(jobId, {
        status: "failed",
        error: "Cancelled by user",
        completedAt: new Date(),
      });

      loggerAdvanced.info(`Cancelled job ${jobId}`);

      return Response.json({
        success: true,
        message: "Job cancelled",
        jobId,
      });
    } else {
      return Response.json(
        { message: "Invalid action. Use 'resume' or 'cancel'" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    loggerAdvanced.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
