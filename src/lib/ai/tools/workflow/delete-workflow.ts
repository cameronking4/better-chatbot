import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const deleteWorkflowTool = createTool({
  description:
    "Delete a workflow permanently. Only the workflow owner can delete it. This will also delete all nodes and edges in the workflow.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow to delete"),
  }),
  execute: async ({ workflowId }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to delete workflows",
        };
      }

      // Get workflow to check ownership
      const workflow = await workflowRepository.selectById(workflowId);

      if (!workflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      // Only owner can delete
      if (workflow.userId !== session.user.id) {
        return {
          isError: true,
          error:
            "You don't have permission to delete this workflow. Only the owner can delete workflows.",
        };
      }

      await workflowRepository.delete(workflowId);

      return {
        success: true,
        message: `Successfully deleted workflow "${workflow.name}"`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to delete workflow",
        solution:
          "Make sure the workflow ID is correct and you are the owner of this workflow.",
      };
    }
  },
});
