import { tool as createTool } from "ai";
import { z } from "zod";
import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { canCreateAgent } from "lib/auth/permissions";
import { ChatMention } from "app-types/chat";
import { DefaultToolName } from "lib/ai/tools";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { workflowRepository } from "lib/db/repository";
import { objectFlow } from "lib/utils";

export const createAgentTool = createTool({
  description:
    "Create a new AI agent with custom instructions, tools, and settings. Agents can be configured with specific roles, system prompts, and tool access to handle specialized tasks.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("The name of the agent (1-100 characters)"),
    description: z
      .string()
      .max(8000)
      .optional()
      .describe("Optional description of what the agent does"),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string().describe("Emoji value (e.g., '1f916')"),
        style: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Optional style properties like backgroundColor (e.g., {'backgroundColor': 'oklch(80.8% 0.114 19.571)'})",
          ),
      })
      .optional()
      .describe(
        "Optional icon configuration for the agent. Use emoji picker URLs from https://cdn.jsdelivr.net/npm/emoji-datasource-apple/",
      ),
    role: z
      .string()
      .optional()
      .describe(
        "The role or expertise area of the agent (e.g., 'Data Analyst', 'Weather Expert')",
      ),
    systemPrompt: z
      .string()
      .optional()
      .describe(
        "Custom system prompt/instructions that define the agent's behavior and capabilities",
      ),
    tools: z
      .array(z.string())
      .optional()
      .describe(
        "Array of tool names the agent can use (e.g., ['webSearch', 'http', 'createTable'])",
      ),
    visibility: z
      .enum(["private", "readonly", "public"])
      .optional()
      .default("readonly")
      .describe(
        "Agent visibility: private (only you), readonly (others can view/use), public (others can edit). Default: readonly",
      ),
  }),
  execute: async ({
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
          error: "Unauthorized - you must be logged in to create agents",
        };
      }

      // Check if user has permission to create agents
      const hasPermission = await canCreateAgent();
      if (!hasPermission) {
        return {
          isError: true,
          error: "You don't have permission to create agents",
        };
      }

      // Convert tool names to mentions
      const mentions: ChatMention[] = [];
      if (tools && tools.length > 0) {
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
          const workflowTools = await workflowRepository.selectExecuteAbility(
            session.user.id,
          );
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

      const agent = await agentRepository.insertAgent({
        name,
        description,
        icon,
        userId: session.user.id,
        instructions: {
          role,
          systemPrompt,
          mentions: mentions.length > 0 ? mentions : undefined,
        },
        visibility: visibility || "readonly",
      });

      return {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          role: agent.instructions?.role,
          visibility: agent.visibility,
          toolCount: mentions.length,
          createdAt: agent.createdAt,
        },
        message: `Successfully created agent "${name}" with ID: ${agent.id}${mentions.length > 0 ? ` and ${mentions.length} tool(s)` : ""}`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to create agent",
        solution:
          "Make sure all required fields are provided and you have permission to create agents.",
      };
    }
  },
});
