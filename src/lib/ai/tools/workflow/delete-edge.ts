import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const deleteEdgeTool = createTool({
  description:
    "Remove a connection between two nodes in a workflow. You can specify the edge by ID or by source and target node names/IDs.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow"),
    edgeId: z
      .string()
      .optional()
      .describe("The ID of the edge to delete (if known)"),
    sourceNodeId: z
      .string()
      .optional()
      .describe("Alternative: specify source node ID"),
    targetNodeId: z
      .string()
      .optional()
      .describe("Alternative: specify target node ID"),
    sourceNodeName: z
      .string()
      .optional()
      .describe("Alternative: specify source node by name"),
    targetNodeName: z
      .string()
      .optional()
      .describe("Alternative: specify target node by name"),
  }),
  execute: async ({
    workflowId,
    edgeId,
    sourceNodeId,
    targetNodeId,
    sourceNodeName,
    targetNodeName,
  }) => {
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

      const workflow = await workflowRepository.selectStructureById(workflowId);
      if (!workflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      let targetEdge;

      if (edgeId) {
        targetEdge = workflow.edges.find((e) => e.id === edgeId);
      } else {
        // Resolve node IDs from names if provided
        let sourceId = sourceNodeId;
        let targetId = targetNodeId;

        if (sourceNodeName) {
          const node = workflow.nodes.find((n) => n.name === sourceNodeName);
          if (node) sourceId = node.id;
        }
        if (targetNodeName) {
          const node = workflow.nodes.find((n) => n.name === targetNodeName);
          if (node) targetId = node.id;
        }

        if (sourceId && targetId) {
          targetEdge = workflow.edges.find(
            (e) => e.source === sourceId && e.target === targetId,
          );
        }
      }

      if (!targetEdge) {
        return {
          isError: true,
          error: "Edge not found",
        };
      }

      await workflowRepository.saveStructure({
        workflowId,
        nodes: [],
        edges: [],
        deleteEdges: [targetEdge.id],
      });

      const sourceNode = workflow.nodes.find((n) => n.id === targetEdge!.source);
      const targetNode = workflow.nodes.find((n) => n.id === targetEdge!.target);

      return {
        success: true,
        message: `Successfully deleted edge from "${sourceNode?.name}" to "${targetNode?.name}"`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to delete edge",
      };
    }
  },
});
