import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const listWorkflowsTool = createTool({
  description:
    "List all workflows accessible to you (your own workflows plus shared workflows). Returns workflow summaries with metadata.",
  inputSchema: z.object({
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("Maximum number of workflows to return (1-100, default: 50)"),
  }),
  execute: async ({ limit = 50 }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to list workflows",
        };
      }

      const workflows = await workflowRepository.selectAll(session.user.id);

      // Limit results
      const limitedWorkflows = workflows.slice(0, limit);

      return {
        success: true,
        workflows: limitedWorkflows.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          visibility: w.visibility,
          published: w.isPublished,
          isOwner: w.userId === session.user.id,
          createdBy: w.userName,
          updatedAt: w.updatedAt,
        })),
        total: limitedWorkflows.length,
        message: `Found ${limitedWorkflows.length} workflow(s)`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to list workflows",
      };
    }
  },
});
