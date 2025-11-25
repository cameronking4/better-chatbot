import { tool as createTool } from "ai";
import { z } from "zod";
import { workflowRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const updateWorkflowTool = createTool({
  description:
    "Update an existing workflow's metadata (name, description, icon, visibility, published status). You can only update workflows you own or public workflows.",
  inputSchema: z.object({
    workflowId: z.string().describe("The ID of the workflow to update"),
    name: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe("New name for the workflow"),
    description: z
      .string()
      .max(8000)
      .optional()
      .describe("New description for the workflow"),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string().describe("Emoji value (e.g., '1f916')"),
        style: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional style properties like backgroundColor"),
      })
      .optional()
      .describe("New icon configuration"),
    visibility: z
      .enum(["private", "readonly", "public"])
      .optional()
      .describe("New visibility setting"),
    published: z
      .boolean()
      .optional()
      .describe("New published status (true = executable, false = draft)"),
  }),
  execute: async ({
    workflowId,
    name,
    description,
    icon,
    visibility,
    published,
  }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to update workflows",
        };
      }

      // Check access
      const hasAccess = await workflowRepository.checkAccess(
        workflowId,
        session.user.id,
        false, // Need write access
      );

      if (!hasAccess) {
        return {
          isError: true,
          error:
            "You don't have permission to update this workflow. You can only update workflows you own or public workflows.",
        };
      }

      // Get current workflow
      const currentWorkflow = await workflowRepository.selectById(workflowId);
      if (!currentWorkflow) {
        return {
          isError: true,
          error: "Workflow not found",
        };
      }

      // Build update object
      const updateData: any = {
        id: workflowId,
        userId: currentWorkflow.userId,
      };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (icon !== undefined) updateData.icon = icon;
      if (visibility !== undefined) updateData.visibility = visibility;
      if (published !== undefined) updateData.isPublished = published;

      const workflow = await workflowRepository.save(updateData, true); // noGenerateInputNode = true

      return {
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          visibility: workflow.visibility,
          published: workflow.isPublished,
          updatedAt: workflow.updatedAt,
        },
        message: `Successfully updated workflow "${workflow.name}"${workflow.isPublished ? " (published)" : " (draft)"}`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to update workflow",
        solution:
          "Make sure the workflow ID is correct and you have permission to update this workflow.",
      };
    }
  },
});
