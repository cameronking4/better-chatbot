import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const deleteNodeTool = createTool({
  description:
    "Remove a node from a workflow. This will also delete any edges connected to this node.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow"),
    nodeId: z
      .string()
      .describe("The ID of the node to delete (or use nodeName)"),
    nodeName: z
      .string()
      .optional()
      .describe("Alternative: specify node by name instead of ID"),
  }),
  execute: async ({ workflowId, nodeId, nodeName }) => {
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
        false,
      );

      if (!hasAccess) {
        return {
          isError: true,
          error: "You don't have permission to modify this workflow",
        };
      }

      // Get workflow structure
      const workflow = await workflowRepository.selectStructureById(workflowId);
      if (!workflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      // Find the node
      let targetNode = workflow.nodes.find((n) => n.id === nodeId);
      if (!targetNode && nodeName) {
        targetNode = workflow.nodes.find((n) => n.name === nodeName);
      }

      if (!targetNode) {
        return {
          isError: true,
          error: `Node not found${nodeName ? ` with name "${nodeName}"` : ""}`,
        };
      }

      // Find edges connected to this node
      const connectedEdges = workflow.edges.filter(
        (e) => e.source === targetNode!.id || e.target === targetNode!.id,
      );

      await workflowRepository.saveStructure({
        workflowId,
        nodes: [],
        edges: [],
        deleteNodes: [targetNode.id],
        deleteEdges: connectedEdges.map((e) => e.id),
      });

      return {
        success: true,
        message: `Successfully deleted node "${targetNode.name}" and ${connectedEdges.length} connected edge(s)`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to delete node",
      };
    }
  },
});
