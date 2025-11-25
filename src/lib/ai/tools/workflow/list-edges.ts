import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const listEdgesTool = createTool({
  description:
    "List all connections (edges) in a workflow, showing which nodes are connected.",
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
        true,
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
        edges: workflow.edges.map((edge) => {
          const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
          const targetNode = workflow.nodes.find((n) => n.id === edge.target);
          return {
            id: edge.id,
            source: sourceNode?.name || edge.source,
            target: targetNode?.name || edge.target,
            sourceHandle: edge.uiConfig.sourceHandle,
            targetHandle: edge.uiConfig.targetHandle,
          };
        }),
        total: workflow.edges.length,
        message: `Found ${workflow.edges.length} edge(s) in workflow "${workflow.name}"`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to list edges",
      };
    }
  },
});
