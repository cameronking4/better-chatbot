import { z } from "zod";
import { tool } from "ai";
import { scheduledTaskRepository } from "@/lib/db/repository";
import { addScheduledTaskToQueue } from "@/lib/scheduler/scheduler";
import { calculateNextRun } from "@/lib/scheduler/schedule-utils";
import { getSession } from "auth/server";

const scheduleTaskSchema = z.object({
  name: z.string().describe("A descriptive name for the scheduled task"),
  prompt: z.string().describe("The prompt to execute"),
  schedule: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("cron"),
      expression: z.string().describe("Cron expression (e.g., '0 9 * * *')"),
    }),
    z.object({
      type: z.literal("interval"),
      value: z.number().min(1).describe("Interval value"),
      unit: z
        .enum(["minutes", "hours", "days", "weeks"])
        .describe("Interval unit"),
    }),
  ]),
  description: z.string().optional().describe("Optional description of the task"),
});

export const scheduleTaskTool = tool({
  description:
    "Schedule a task to run a prompt at a specified interval or cron schedule. Use this when the user asks to run something periodically, like 'every day at 9am' or 'every 30 minutes'.",
  inputSchema: scheduleTaskSchema,
  execute: async ({ name, prompt, schedule, description }) => {
    try {
      const session = await getSession();
      if (!session?.user?.id) {
        return {
          success: false,
          message: "Unauthorized: You must be logged in to schedule tasks.",
        };
      }

      // Calculate next run time
      const nextRunAt = calculateNextRun(schedule);

      // Create task in database
      const task = await scheduledTaskRepository.insertScheduledTask(
        session.user.id,
        {
          name,
          prompt,
          schedule,
          description,
          enabled: true,
        },
      );

      // Update next run time in database
      if (nextRunAt) {
        await scheduledTaskRepository.updateLastRun(
          task.id,
          new Date(0),
          nextRunAt,
        );
        task.nextRunAt = nextRunAt;
      }

      // Add to scheduler queue
      await addScheduledTaskToQueue(task);

      return {
        success: true,
        message: `Scheduled task '${name}' created successfully.`,
        task: {
          id: task.id,
          name: task.name,
          nextRunAt: task.nextRunAt,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to schedule task: ${error.message}`,
      };
    }
  },
});
