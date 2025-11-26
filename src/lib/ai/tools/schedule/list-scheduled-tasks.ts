import { z } from "zod";
import { tool } from "ai";
import { scheduledTaskRepository } from "@/lib/db/repository";
import { getScheduleDescription } from "@/lib/scheduler/schedule-utils";
import { getSession } from "auth/server";

export const listScheduledTasksTool = tool({
  description: "List all scheduled tasks for the current user.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const session = await getSession();
      if (!session?.user?.id) {
        return "Unauthorized: You must be logged in to view scheduled tasks.";
      }

      const tasks = await scheduledTaskRepository.selectScheduledTasks(
        session.user.id,
      );

      if (tasks.length === 0) {
        return "You have no scheduled tasks.";
      }

      const taskList = tasks.map((task) => {
        const scheduleDesc = getScheduleDescription(task.schedule);
        const nextRun = task.nextRunAt
          ? new Date(task.nextRunAt).toLocaleString()
          : "Not scheduled";
        const status = task.enabled ? "Enabled" : "Disabled";

        return `- **${task.name}**: ${scheduleDesc} (${status})\n  Next run: ${nextRun}\n  ID: ${task.id}`;
      });

      return `Here are your scheduled tasks:\n\n${taskList.join("\n")}`;
    } catch (error: any) {
      return `Failed to list scheduled tasks: ${error.message}`;
    }
  },
});
