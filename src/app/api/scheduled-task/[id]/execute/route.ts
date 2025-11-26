import { getSession } from "auth/server";
import { scheduledTaskRepository } from "@/lib/db/repository";
import { executeScheduledTask } from "@/lib/scheduler/task-executor";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    // Check if task exists and belongs to user
    const task = await scheduledTaskRepository.selectScheduledTask(
      id,
      session.user.id,
    );

    if (!task) {
      return new Response("Not Found", { status: 404 });
    }

    // Create execution record
    const execution = await scheduledTaskRepository.insertExecution({
      scheduledTaskId: task.id,
      status: "running",
      startedAt: new Date(),
    });

    try {
      // Execute task immediately
      const result = await executeScheduledTask(task);

      // Update execution record
      await scheduledTaskRepository.updateExecution(execution.id, {
        status: result.success ? "success" : "failed",
        threadId: result.threadId,
        error: result.error,
        completedAt: new Date(),
        duration: result.duration.toString(),
      });

      // Update last run time (but not next run time, as this is manual)
      await scheduledTaskRepository.updateLastRun(
        task.id,
        new Date(),
        task.nextRunAt || null,
      );

      return Response.json({
        success: result.success,
        threadId: result.threadId,
        executionId: execution.id,
      });
    } catch (error: any) {
      // Update execution record with failure
      await scheduledTaskRepository.updateExecution(execution.id, {
        status: "failed",
        error: error.message,
        completedAt: new Date(),
      });

      throw error;
    }
  } catch (error) {
    console.error("Failed to execute scheduled task:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
