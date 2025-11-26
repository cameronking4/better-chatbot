import { getSession } from "auth/server";
import { scheduledTaskRepository } from "@/lib/db/repository";
import { addScheduledTaskToQueue } from "@/lib/scheduler/scheduler";
import { calculateNextRun } from "@/lib/scheduler/schedule-utils";
import { z } from "zod";

const createScheduledTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  schedule: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("cron"),
      expression: z.string(),
    }),
    z.object({
      type: z.literal("interval"),
      value: z.number().min(1),
      unit: z.enum(["minutes", "hours", "days", "weeks"]),
    }),
  ]),
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
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const tasks = await scheduledTaskRepository.selectScheduledTasks(
      session.user.id,
    );
    return Response.json(tasks);
  } catch (error) {
    console.error("Failed to fetch scheduled tasks:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const json = await request.json();
    const body = createScheduledTaskSchema.parse(json);

    // Calculate next run time
    const nextRunAt = calculateNextRun(body.schedule);

    // Create task in database
    const task = await scheduledTaskRepository.insertScheduledTask(
      session.user.id,
      {
        ...body,
      },
    );

    // Update next run time in database
    if (nextRunAt) {
      await scheduledTaskRepository.updateLastRun(task.id, new Date(0), nextRunAt);
      task.nextRunAt = nextRunAt;
    }

    // Add to scheduler queue if enabled
    if (task.enabled) {
      await addScheduledTaskToQueue(task);
    }

    return Response.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify((error as any).errors), { status: 400 });
    }
    console.error("Failed to create scheduled task:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
