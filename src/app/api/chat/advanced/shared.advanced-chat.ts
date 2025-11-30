import "server-only";
import { Tool, UIMessageStreamWriter } from "ai";
import { ChatMention } from "app-types/chat";
import logger from "logger";
import { AllowedMCPServer, VercelAIMcpTool } from "app-types/mcp";
import { safe } from "ts-safe";
import { workflowRepository } from "lib/db/repository";
import { VercelAIWorkflowTool } from "app-types/workflow";
import { workflowToVercelAITools } from "../shared.chat";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { APP_DEFAULT_TOOL_KIT } from "lib/ai/tools/tool-kit";
import { AppDefaultToolkit } from "lib/ai/tools";
import {
  filterMCPToolsByMentions,
  filterMCPToolsByAllowedMCPServers,
} from "../shared.chat";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildUserSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
} from "lib/ai/prompts";
import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";
import { mergeSystemPrompt } from "../shared.chat";
import { nanoBananaTool, openaiImageTool } from "lib/ai/tools/image";
import { ImageToolName } from "lib/ai/tools";
import type { Agent } from "app-types/agent";
import type { UserPreferences } from "app-types/user";
import type { ChatModel } from "@/types/chat";

export interface LoadToolsResult {
  mcpTools: Record<string, VercelAIMcpTool>;
  workflowTools: Record<string, VercelAIWorkflowTool>;
  appDefaultTools: Record<string, Tool>;
  imageTool: Record<string, Tool>;
}

/**
 * Load MCP tools based on mentions or allowed servers
 */
export async function loadMcpToolsForAdvanced(
  mentions?: ChatMention[],
  allowedMcpServers?: Record<string, AllowedMCPServer>,
): Promise<Record<string, VercelAIMcpTool>> {
  return safe(() => mcpClientsManager.tools())
    .map((tools) => {
      if (mentions && mentions.length > 0) {
        return filterMCPToolsByMentions(tools, mentions);
      }
      return filterMCPToolsByAllowedMCPServers(tools, allowedMcpServers);
    })
    .orElse({} as Record<string, VercelAIMcpTool>);
}

/**
 * Load workflow tools based on mentions
 */
export async function loadWorkFlowToolsForAdvanced(
  mentions?: ChatMention[],
  dataStream?: UIMessageStreamWriter,
): Promise<Record<string, VercelAIWorkflowTool>> {
  if (!dataStream) {
    return {};
  }

  return safe(() =>
    mentions && mentions.length > 0
      ? workflowRepository.selectToolByIds(
          mentions
            .filter((m) => m.type == "workflow")
            .map(
              (v) =>
                (v as Extract<ChatMention, { type: "workflow" }>).workflowId,
            ),
        )
      : [],
  )
    .map((tools) => workflowToVercelAITools(tools, dataStream))
    .orElse({} as Record<string, VercelAIWorkflowTool>);
}

/**
 * Load app default tools
 */
export async function loadAppDefaultToolsForAdvanced(
  mentions?: ChatMention[],
  allowedAppDefaultToolkit?: string[],
): Promise<Record<string, Tool>> {
  return safe(APP_DEFAULT_TOOL_KIT)
    .map((tools) => {
      if (mentions && mentions.length > 0) {
        const defaultToolMentions = mentions.filter(
          (m) => m.type == "defaultTool",
        );
        return Object.values(tools).reduce((acc, t) => {
          const allowed = Object.entries(t).reduce(
            (a, [k, v]) => {
              if (defaultToolMentions.some((m) => m.name == k)) {
                a[k] = v;
              }
              return a;
            },
            {} as Record<string, Tool>,
          );
          return { ...acc, ...allowed };
        }, {});
      }
      const allowedToolkit =
        allowedAppDefaultToolkit ?? Object.values(AppDefaultToolkit);

      return allowedToolkit.reduce(
        (acc, key) => {
          return { ...acc, ...tools[key] };
        },
        {} as Record<string, Tool>,
      );
    })
    .ifFail((e) => {
      logger.error("Failed to load app default tools:", e);
      throw e;
    })
    .orElse({} as Record<string, Tool>);
}

/**
 * Load all tools for advanced chat
 */
export async function loadAllToolsForAdvanced(
  mentions?: ChatMention[],
  allowedMcpServers?: Record<string, AllowedMCPServer>,
  allowedAppDefaultToolkit?: string[],
  imageTool?: { model?: string },
  dataStream?: UIMessageStreamWriter,
): Promise<LoadToolsResult> {
  const [mcpTools, workflowTools, appDefaultTools] = await Promise.all([
    loadMcpToolsForAdvanced(mentions, allowedMcpServers),
    loadWorkFlowToolsForAdvanced(mentions, dataStream),
    loadAppDefaultToolsForAdvanced(mentions, allowedAppDefaultToolkit),
  ]);

  const imageToolRecord: Record<string, Tool> = imageTool?.model
    ? {
        [ImageToolName]:
          imageTool.model === "google" ? nanoBananaTool : openaiImageTool,
      }
    : {};

  return {
    mcpTools,
    workflowTools,
    appDefaultTools,
    imageTool: imageToolRecord,
  };
}

/**
 * Build system prompt for advanced chat
 */
export function buildSystemPromptForAdvanced(
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    emailVerified: boolean;
  },
  userPreferences?: UserPreferences,
  agent?: Agent | null,
  mcpServerCustomizations?: Record<string, any>,
  chatModel?: ChatModel,
): string {
  const supportToolCall = chatModel
    ? !isToolCallUnsupportedModel(customModelProvider.getModel(chatModel))
    : true;

  return mergeSystemPrompt(
    buildUserSystemPrompt(user, userPreferences, agent ?? undefined),
    mcpServerCustomizations && Object.keys(mcpServerCustomizations).length > 0
      ? buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations)
      : undefined,
    !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
  );
}

/**
 * Combine all tools into a single record
 */
export function combineTools(
  tools: LoadToolsResult,
  toolChoice?: "auto" | "none" | "manual",
): Record<string, Tool> {
  const combined = {
    ...tools.mcpTools,
    ...tools.workflowTools,
    ...tools.appDefaultTools,
    ...tools.imageTool,
  };

  // If manual tool choice, exclude execution (binding only)
  if (toolChoice === "manual") {
    return Object.entries(combined).reduce(
      (acc, [name, tool]) => {
        acc[name] = {
          ...tool,
          execute: undefined, // Remove execution for manual mode
        } as Tool;
        return acc;
      },
      {} as Record<string, Tool>,
    );
  }

  return combined;
}
