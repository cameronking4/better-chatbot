import { advancedChatRepository } from "@/lib/db/repository";
import { getSession } from "auth/server";
import { validateApiKeyFromHeader } from "@/lib/auth/api-key-auth";
import { colorize } from "consola/utils";
import globalLogger from "logger";

const loggerAdvanced = globalLogger.withDefaults({
  message: colorize("blackBright", `Advanced Chat API: `),
});

/**
 * GET /api/chat/advanced/[jobId]/iterations
 * Get all iterations for a job
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

    // Verify job access
    const job = await advancedChatRepository.selectJob(jobId, userId);
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    // Load iterations
    const iterations =
      await advancedChatRepository.selectIterationsByJobId(jobId);

    return Response.json({
      jobId,
      iterations,
      count: iterations.length,
    });
  } catch (error: any) {
    loggerAdvanced.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
