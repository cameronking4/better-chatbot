import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const getWorkflowStructureTool = createTool({
  description:
    "Get the complete structure of a workflow including metadata, all nodes, and all edges. Useful for understanding an existing workflow before making changes.",
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
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          visibility: workflow.visibility,
          published: workflow.isPublished,
          nodes: workflow.nodes.map((node) => ({
            id: node.id,
            type: node.kind,
            name: node.name,
            description: node.description,
            position: node.uiConfig.position,
            config: node.nodeConfig,
          })),
          edges: workflow.edges.map((edge) => {
            const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
            const targetNode = workflow.nodes.find((n) => n.id === edge.target);
            return {
              id: edge.id,
              source: sourceNode?.name || edge.source,
              target: targetNode?.name || edge.target,
              sourceHandle: edge.uiConfig.sourceHandle,
            };
          }),
        },
        summary: `Workflow "${workflow.name}" has ${workflow.nodes.length} node(s) and ${workflow.edges.length} edge(s)`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to get workflow structure",
      };
    }
  },
});
