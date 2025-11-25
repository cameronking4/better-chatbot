import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { createUINode } from "lib/ai/workflow/create-ui-node";
import { convertUINodeToDBNode } from "lib/ai/workflow/shared.workflow";
import { NodeKind } from "lib/ai/workflow/workflow.interface";

export const addNodeTool = createTool({
  description:
    "Add a node (step) to a workflow. Nodes are the building blocks of workflows. Each node type has specific capabilities: Input (entry point), LLM (AI interaction), Tool (execute tools), HTTP (API calls), Template (text processing), Condition (branching), Output (exit point), Note (documentation).",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow to add the node to"),
    nodeType: z
      .enum([
        "input",
        "llm",
        "tool",
        "http",
        "template",
        "condition",
        "output",
        "note",
      ])
      .describe(
        "Type of node: input (entry), llm (AI), tool (execute tools), http (API call), template (text), condition (branching), output (exit), note (documentation)",
      ),
    name: z
      .string()
      .min(1)
      .max(100)
      .describe(
        "Unique name for the node within the workflow (e.g., 'Fetch Weather', 'Analyze Data')",
      ),
    description: z
      .string()
      .optional()
      .describe("Optional description of what this node does"),
    position: z
      .object({
        x: z.number().describe("X coordinate for visual positioning"),
        y: z.number().describe("Y coordinate for visual positioning"),
      })
      .optional()
      .describe(
        "Optional position for visual layout. If not provided, defaults to (0, 0)",
      ),
    config: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        "Node-specific configuration. For LLM: {model: {provider, model}, messages: [{role, content}]}. For HTTP: {url, method, headers, query, body}. For Tool: {tool: {id, type}, model}. For Template: {template: {type: 'tiptap', tiptap}}. For Condition: {branches: {if, else}}. For Output: {outputData: [{key, source}]}",
      ),
  }),
  execute: async ({
    workflowId,
    nodeType,
    name,
    description,
    position,
    config,
  }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to add nodes",
        };
      }

      // Check access
      const hasAccess = await workflowRepository.checkAccess(
        workflowId,
        session.user.id,
        false,
      );

      if (!hasAccess) {
        return {
          isError: true,
          error:
            "You don't have permission to modify this workflow. You can only modify workflows you own or public workflows.",
        };
      }

      // Create UI node with defaults
      const uiNode = createUINode(nodeType as NodeKind, {
        name,
        position: position || { x: 0, y: 0 },
      });

      // Apply custom description
      if (description) {
        uiNode.data.description = description;
      }

      // Apply node-specific config
      if (config) {
        // Merge config into node data
        Object.assign(uiNode.data, config);
      }

      // Convert to DB format
      const dbNode = convertUINodeToDBNode(workflowId, uiNode);

      // Save to database
      await workflowRepository.saveStructure({
        workflowId,
        nodes: [dbNode as any],
        edges: [],
      });

      return {
        success: true,
        node: {
          id: uiNode.id,
          type: nodeType,
          name: uiNode.data.name,
          description: uiNode.data.description,
          position: uiNode.position,
        },
        message: `Successfully added ${nodeType.toUpperCase()} node "${name}" to workflow`,
        nextSteps:
          "Use add-edge tool to connect this node to other nodes in the workflow.",
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to add node",
        solution:
          "Make sure the workflow ID is correct, the node name is unique within the workflow, and you have permission to modify this workflow.",
      };
    }
  },
});
