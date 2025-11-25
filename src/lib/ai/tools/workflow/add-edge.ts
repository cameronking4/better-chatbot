import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { generateUUID } from "lib/utils";
import { convertUIEdgeToDBEdge } from "lib/ai/workflow/shared.workflow";
import { Edge } from "@xyflow/react";

export const addEdgeTool = createTool({
  description:
    "Connect two nodes in a workflow to define execution flow. Edges determine the order in which nodes execute. For condition nodes, you can specify which branch (if/elseIf/else) the edge comes from using sourceHandle.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow"),
    sourceNodeId: z
      .string()
      .describe("The ID of the source node (or use sourceNodeName)"),
    targetNodeId: z
      .string()
      .describe("The ID of the target node (or use targetNodeName)"),
    sourceNodeName: z
      .string()
      .optional()
      .describe("Alternative: specify source node by name"),
    targetNodeName: z
      .string()
      .optional()
      .describe("Alternative: specify target node by name"),
    sourceHandle: z
      .string()
      .optional()
      .describe(
        "For condition nodes: specify which branch ('if', 'elseIf', 'else'). Leave empty for other node types.",
      ),
  }),
  execute: async ({
    workflowId,
    sourceNodeId,
    targetNodeId,
    sourceNodeName,
    targetNodeName,
    sourceHandle,
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

      // Get workflow structure to resolve node names
      const workflow = await workflowRepository.selectStructureById(workflowId);
      if (!workflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      // Resolve source node
      let sourceId = sourceNodeId;
      if (!sourceId && sourceNodeName) {
        const sourceNode = workflow.nodes.find((n) => n.name === sourceNodeName);
        if (!sourceNode) {
          return {
            isError: true,
            error: `Source node not found with name "${sourceNodeName}"`,
          };
        }
        sourceId = sourceNode.id;
      }

      // Resolve target node
      let targetId = targetNodeId;
      if (!targetId && targetNodeName) {
        const targetNode = workflow.nodes.find((n) => n.name === targetNodeName);
        if (!targetNode) {
          return {
            isError: true,
            error: `Target node not found with name "${targetNodeName}"`,
          };
        }
        targetId = targetNode.id;
      }

      // Verify both nodes exist
      const sourceExists = workflow.nodes.some((n) => n.id === sourceId);
      const targetExists = workflow.nodes.some((n) => n.id === targetId);

      if (!sourceExists || !targetExists) {
        return {
          isError: true,
          error: "Source or target node not found in workflow",
        };
      }

      // Create edge
      const edge: Edge = {
        id: generateUUID(),
        source: sourceId,
        target: targetId,
        sourceHandle: sourceHandle || undefined,
      };

      const dbEdge = convertUIEdgeToDBEdge(workflowId, edge);

      await workflowRepository.saveStructure({
        workflowId,
        nodes: [],
        edges: [dbEdge as any],
      });

      const sourceNode = workflow.nodes.find((n) => n.id === sourceId);
      const targetNode = workflow.nodes.find((n) => n.id === targetId);

      return {
        success: true,
        edge: {
          id: edge.id,
          source: sourceNode?.name || sourceId,
          target: targetNode?.name || targetId,
          sourceHandle: sourceHandle,
        },
        message: `Successfully connected "${sourceNode?.name}" to "${targetNode?.name}"${sourceHandle ? ` via ${sourceHandle} branch` : ""}`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to add edge",
      };
    }
  },
});
