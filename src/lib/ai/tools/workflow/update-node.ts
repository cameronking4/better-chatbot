import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import {
  convertDBNodeToUINode,
  convertUINodeToDBNode,
} from "lib/ai/workflow/shared.workflow";

export const updateNodeTool = createTool({
  description:
    "Update an existing node's configuration in a workflow. You can update the name, description, position, or node-specific configuration.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow"),
    nodeId: z
      .string()
      .describe("The ID of the node to update (or use nodeName if preferred)"),
    nodeName: z
      .string()
      .optional()
      .describe(
        "Alternative: specify node by name instead of ID. Will update the first node with this name.",
      ),
    updates: z.object({
      name: z.string().optional().describe("New name for the node"),
      description: z.string().optional().describe("New description"),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .optional()
        .describe("New position"),
      config: z
        .record(z.string(), z.any())
        .optional()
        .describe("Updated node-specific configuration"),
    }),
  }),
  execute: async ({ workflowId, nodeId, nodeName, updates }) => {
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

      // Convert to UI node, apply updates, convert back
      const uiNode = convertDBNodeToUINode(targetNode);

      if (updates.name) uiNode.data.name = updates.name;
      if (updates.description !== undefined)
        uiNode.data.description = updates.description;
      if (updates.position) uiNode.position = updates.position;
      if (updates.config) {
        Object.assign(uiNode.data, updates.config);
      }

      const updatedDbNode = convertUINodeToDBNode(workflowId, uiNode);

      await workflowRepository.saveStructure({
        workflowId,
        nodes: [updatedDbNode as any],
        edges: [],
      });

      return {
        success: true,
        node: {
          id: uiNode.id,
          name: uiNode.data.name,
          description: uiNode.data.description,
          type: uiNode.data.kind,
        },
        message: `Successfully updated node "${uiNode.data.name}"`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to update node",
      };
    }
  },
});
