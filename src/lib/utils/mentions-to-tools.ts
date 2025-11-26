import { ChatMention } from "app-types/chat";
import { AllowedMCPServer } from "app-types/mcp";
import { AppDefaultToolkit, DefaultToolName } from "lib/ai/tools";

/**
 * Converts ChatMention[] to allowedMcpServers and allowedAppDefaultToolkit
 * for use in scheduled tasks
 */
export function convertMentionsToToolConfig(mentions: ChatMention[]): {
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
} {
  const allowedMcpServers: Record<string, AllowedMCPServer> = {};
  const allowedAppDefaultToolkitSet = new Set<AppDefaultToolkit>();

  // Group MCP tools by server
  const mcpToolMentions = mentions.filter((m) => m.type === "mcpTool");
  for (const mention of mcpToolMentions) {
    if (mention.type === "mcpTool" && mention.serverId) {
      if (!allowedMcpServers[mention.serverId]) {
        allowedMcpServers[mention.serverId] = { tools: [] };
      }
      if (!allowedMcpServers[mention.serverId].tools.includes(mention.name)) {
        allowedMcpServers[mention.serverId].tools.push(mention.name);
      }
    }
  }

  // Extract default tools and map to AppDefaultToolkit
  const defaultToolMentions = mentions.filter((m) => m.type === "defaultTool");
  for (const mention of defaultToolMentions) {
    if (mention.type === "defaultTool") {
      // Map DefaultToolName to AppDefaultToolkit
      const toolName = mention.name as DefaultToolName;

      // Visualization tools
      if (
        toolName === DefaultToolName.CreatePieChart ||
        toolName === DefaultToolName.CreateBarChart ||
        toolName === DefaultToolName.CreateLineChart ||
        toolName === DefaultToolName.CreateTable
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Visualization);
      }
      // Web search tools
      else if (
        toolName === DefaultToolName.WebSearch ||
        toolName === DefaultToolName.WebContent
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.WebSearch);
      }
      // HTTP tools
      else if (toolName === DefaultToolName.Http) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Http);
      }
      // Code execution tools
      else if (
        toolName === DefaultToolName.JavascriptExecution ||
        toolName === DefaultToolName.PythonExecution
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Code);
      }
      // Agent tools
      else if (
        toolName === DefaultToolName.CreateAgent ||
        toolName === DefaultToolName.UpdateAgent ||
        toolName === DefaultToolName.DeleteAgent ||
        toolName === DefaultToolName.ListAgents
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Agent);
      }
      // Workflow tools
      else if (
        toolName === DefaultToolName.CreateWorkflow ||
        toolName === DefaultToolName.UpdateWorkflow ||
        toolName === DefaultToolName.DeleteWorkflow ||
        toolName === DefaultToolName.ListWorkflows ||
        toolName === DefaultToolName.AddNode ||
        toolName === DefaultToolName.UpdateNode ||
        toolName === DefaultToolName.DeleteNode ||
        toolName === DefaultToolName.ListNodes ||
        toolName === DefaultToolName.AddEdge ||
        toolName === DefaultToolName.DeleteEdge ||
        toolName === DefaultToolName.ListEdges ||
        toolName === DefaultToolName.GetWorkflowStructure ||
        toolName === DefaultToolName.ListAvailableTools
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Workflow);
      }
      // Schedule tools
      else if (
        toolName === DefaultToolName.ScheduleTask ||
        toolName === DefaultToolName.ListScheduledTasks
      ) {
        allowedAppDefaultToolkitSet.add(AppDefaultToolkit.Schedule);
      }
    }
  }

  return {
    allowedMcpServers:
      Object.keys(allowedMcpServers).length > 0 ? allowedMcpServers : undefined,
    allowedAppDefaultToolkit:
      allowedAppDefaultToolkitSet.size > 0
        ? Array.from(allowedAppDefaultToolkitSet)
        : undefined,
  };
}
