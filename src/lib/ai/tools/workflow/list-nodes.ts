import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const listNodesTool = createTool({
  description:
    "List all nodes in a workflow with their types, names, descriptions, and configurations.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow"),
  }),
  execute: async ({ workflowId }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized",
        };
      }

      const hasAccess = await workflowRepository.checkAccess(
        workflowId,
        session.user.id,
        true, // Read-only access is fine
      );

      if (!hasAccess) {
        return {
          isError: true,
          error: "You don't have permission to view this workflow",
        };
      }

      const workflow = await workflowRepository.selectStructureById(workflowId);
      if (!workflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      return {
        success: true,
        nodes: workflow.nodes.map((node) => ({
          id: node.id,
          type: node.kind,
          name: node.name,
          description: node.description,
          position: node.uiConfig.position,
          config: node.nodeConfig,
        })),
        total: workflow.nodes.length,
        message: `Found ${workflow.nodes.length} node(s) in workflow "${workflow.name}"`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to list nodes",
      };
    }
  },
});
