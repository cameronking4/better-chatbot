import { tool as createTool } from "ai";
import { z } from "zod";
import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { ChatMention } from "app-types/chat";
import { DefaultToolName } from "lib/ai/tools";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { workflowRepository } from "lib/db/repository";
import { objectFlow } from "lib/utils";

export const updateAgentTool = createTool({
  description:
    "Update an existing agent's properties including name, description, icon, role, instructions, tools, or visibility. You can only update agents you own or public agents.",
  inputSchema: z.object({
    agentId: z.string().describe("The ID of the agent to update"),
    name: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe("New name for the agent"),
    description: z
      .string()
      .max(8000)
      .optional()
      .describe("New description for the agent"),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z
          .string()
          .describe(
            "URL to emoji image (e.g., 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f916.png')",
          ),
        style: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Optional style properties like backgroundColor (e.g., {'backgroundColor': 'oklch(80.8% 0.114 19.571)'})",
          ),
      })
      .optional()
      .describe(
        "New icon configuration. Use emoji picker URLs from https://cdn.jsdelivr.net/npm/emoji-datasource-apple/",
      ),
    role: z
      .string()
      .optional()
      .describe("New role or expertise area for the agent"),
    systemPrompt: z
      .string()
      .optional()
      .describe("New system prompt/instructions for the agent"),
    tools: z
      .array(z.string())
      .optional()
      .describe(
        "New array of tool names the agent can use (replaces existing tools)",
      ),
    visibility: z
      .enum(["private", "readonly", "public"])
      .optional()
      .describe("New visibility setting"),
  }),
  execute: async ({
    agentId,
    name,
    description,
    icon,
    role,
    systemPrompt,
    tools,
    visibility,
  }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to update agents",
        };
      }

      // Build the update object
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (icon !== undefined) updateData.icon = icon;
      if (visibility !== undefined) updateData.visibility = visibility;

      // Handle instructions and tools
      if (
        role !== undefined ||
        systemPrompt !== undefined ||
        tools !== undefined
      ) {
        // Get current agent to preserve existing instructions if needed
        const currentAgent = await agentRepository.selectAgentById(
          agentId,
          session.user.id,
        );

        if (!currentAgent) {
          return {
            isError: true,
            error: "Agent not found or you don't have access to it",
          };
        }

        updateData.instructions = {
          role: role !== undefined ? role : currentAgent.instructions?.role,
          systemPrompt:
            systemPrompt !== undefined
              ? systemPrompt
              : currentAgent.instructions?.systemPrompt,
          mentions:
            tools !== undefined
              ? undefined
              : currentAgent.instructions?.mentions, // Will be replaced if tools provided
        };

        // Convert tool names to mentions if tools array provided
        if (tools !== undefined) {
          const mentions: ChatMention[] = [];

          if (tools.length > 0) {
            // Get default tools
            objectFlow(DefaultToolName).forEach((toolName) => {
              if (tools.includes(toolName)) {
                mentions.push({
                  type: "defaultTool",
                  name: toolName,
                  label: toolName,
                });
              }
            });

            // Get MCP tools
            try {
              const mcpClients = await mcpClientsManager.getClients();
              for (const { id, client } of mcpClients) {
                const mcpInfo = client.getInfo();
                if (mcpInfo?.toolInfo) {
                  for (const tool of mcpInfo.toolInfo) {
                    if (tools.includes(tool.name)) {
                      mentions.push({
                        type: "mcpTool",
                        serverName: mcpInfo.name,
                        name: tool.name,
                        serverId: id,
                      });
                    }
                  }
                }
              }
            } catch (_error) {
              // MCP tools optional, continue without them
            }

            // Get workflow tools
            try {
              const workflowTools =
                await workflowRepository.selectExecuteAbility(session.user.id);
              for (const workflow of workflowTools) {
                if (tools.includes(workflow.name)) {
                  mentions.push({
                    type: "workflow",
                    name: workflow.name,
                    workflowId: workflow.id,
                  });
                }
              }
            } catch (_error) {
              // Workflow tools optional, continue without them
            }
          }

          updateData.instructions.mentions =
            mentions.length > 0 ? mentions : undefined;
        }
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return {
          isError: true,
          error: "No fields provided to update",
          solution: "Provide at least one field to update",
        };
      }

      const agent = await agentRepository.updateAgent(
        agentId,
        session.user.id,
        updateData,
      );

      const toolCount = agent.instructions?.mentions?.length || 0;

      return {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          role: agent.instructions?.role,
          visibility: agent.visibility,
          toolCount,
          updatedAt: agent.updatedAt,
        },
        message: `Successfully updated agent "${agent.name}"${toolCount > 0 ? ` with ${toolCount} tool(s)` : ""}`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to update agent",
        solution:
          "Make sure the agent ID is correct and you have permission to update this agent. You can only update agents you own or public agents.",
      };
    }
  },
});
