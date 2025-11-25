import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { canCreateWorkflow } from "lib/auth/permissions";

export const createWorkflowTool = createTool({
  description:
    "Create a new workflow with basic metadata. IMPORTANT: By default, does NOT auto-generate an INPUT node - you must add one manually with proper input parameters. Use add-node tool to create INPUT node with outputSchema defining the workflow's input parameters.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("The name of the workflow (1-100 characters)"),
    description: z
      .string()
      .max(8000)
      .optional()
      .describe("Optional description of what the workflow does"),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z
          .string()
          .describe("Emoji value (e.g., '1f916' for robot emoji)"),
        style: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Optional style properties like backgroundColor (e.g., {'backgroundColor': 'oklch(80.8% 0.114 19.571)'})",
          ),
      })
      .optional()
      .describe("Optional icon configuration for the workflow"),
    visibility: z
      .enum(["private", "readonly", "public"])
      .optional()
      .default("readonly")
      .describe(
        "Workflow visibility: private (only you), readonly (others can view/use), public (others can edit). Default: readonly",
      ),
    published: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Whether the workflow is published and can be executed as a tool. Default: false (draft mode)",
      ),
  }),
  execute: async ({ name, description, icon, visibility, published }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to create workflows",
        };
      }

      // Check if user has permission to create workflows
      const hasPermission = await canCreateWorkflow();
      if (!hasPermission) {
        return {
          isError: true,
          error: "You don't have permission to create workflows",
        };
      }

      const workflow = await workflowRepository.save(
        {
          name,
          description,
          icon,
          userId: session.user.id,
          visibility: visibility || "readonly",
          isPublished: published || false,
        },
        true, // noGenerateInputNode = true to prevent auto-generation
      );

      return {
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          visibility: workflow.visibility,
          published: workflow.isPublished,
          createdAt: workflow.createdAt,
        },
        message: `Successfully created workflow "${name}" with ID: ${workflow.id}. ${workflow.isPublished ? "Workflow is published and can be executed." : "Workflow is in draft mode. Set published=true to enable execution."}`,
        nextSteps:
          "IMPORTANT: Add an INPUT node first with proper input parameters using add-node tool. Then add other nodes (LLM, Tool, HTTP, etc.) and connect them with add-edge tool.",
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to create workflow",
        solution:
          "Make sure all required fields are provided and you have permission to create workflows.",
      };
    }
  },
});
