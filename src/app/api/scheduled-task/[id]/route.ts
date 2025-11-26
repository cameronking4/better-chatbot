import { getSession } from "auth/server";
import { scheduledTaskRepository } from "@/lib/db/repository";
import {
  updateScheduledTaskInQueue,
  removeScheduledTaskFromQueue,
} from "@/lib/scheduler/scheduler";
import { calculateNextRun } from "@/lib/scheduler/schedule-utils";
import { z } from "zod";

const updateScheduledTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  prompt: z.string().min(1).optional(),
  schedule: z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("cron"),
        expression: z.string(),
      }),
      z.object({
        type: z.literal("interval"),
        value: z.number().min(1),
        unit: z.enum(["minutes", "hours", "days", "weeks"]),
      }),
    ])
    .optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().optional(),
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.string().optional(),
  mentions: z.array(z.any()).optional(),
  allowedMcpServers: z
    .record(z.string(), z.object({ tools: z.array(z.string()) }))
    .optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    const task = await scheduledTaskRepository.selectScheduledTask(
      id,
      session.user.id,
    );

    if (!task) {
      return new Response("Not Found", { status: 404 });
    }

    return Response.json(task);
  } catch (error) {
    console.error("Failed to fetch scheduled task:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    const json = await request.json();
    const body = updateScheduledTaskSchema.parse(json);

    // Check if task exists and belongs to user
    const existingTask = await scheduledTaskRepository.selectScheduledTask(
      id,
      session.user.id,
    );

    if (!existingTask) {
      return new Response("Not Found", { status: 404 });
    }

    // Update task in database
    const updatedTask = await scheduledTaskRepository.updateScheduledTask(
      id,
      session.user.id,
      body,
    );

    // If schedule changed, recalculate next run
    if (body.schedule) {
      const nextRunAt = calculateNextRun(body.schedule);
      if (nextRunAt) {
        await scheduledTaskRepository.updateLastRun(
          id,
          updatedTask.lastRunAt || new Date(0),
          nextRunAt,
        );
        updatedTask.nextRunAt = nextRunAt;
      }
    }

    // Update scheduler queue
    await updateScheduledTaskInQueue(updatedTask);

    return Response.json(updatedTask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify((error as any).errors), {
        status: 400,
      });
    }
    console.error("Failed to update scheduled task:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    // Check if task exists and belongs to user
    const existingTask = await scheduledTaskRepository.selectScheduledTask(
      id,
      session.user.id,
    );

    if (!existingTask) {
      return new Response("Not Found", { status: 404 });
    }

    // Remove from scheduler queue
    await removeScheduledTaskFromQueue(id);

    // Delete from database
    await scheduledTaskRepository.deleteScheduledTask(id, session.user.id);

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete scheduled task:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
