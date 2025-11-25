import { tool as createTool } from "ai";
import { z } from "zod";
import { getSession } from "auth/server";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { workflowRepository } from "lib/db/repository";

export const listAvailableToolsTool = createTool({
  description:
    "List all available tools that can be used in Tool nodes, including MCP server tools and published workflow tools. Use this to discover what tools are available before creating Tool nodes in workflows.",
  inputSchema: z.object({
    includeSchemas: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Whether to include full parameter schemas for each tool. Set to true for detailed information.",
      ),
  }),
  execute: async ({ includeSchemas = false }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to list tools",
        };
      }

      const tools: any[] = [];

      // 1. Get Default/App Tools
      const defaultTools = [
        // Visualization Tools
        {
          type: "app-tool",
          id: "createTable",
          name: "Create Table",
          description:
            "Create data tables for displaying structured information in a grid format.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "createBarChart",
          name: "Create Bar Chart",
          description:
            "Create bar charts for visualizing categorical data comparisons.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "createLineChart",
          name: "Create Line Chart",
          description:
            "Create line charts for visualizing trends and changes over time.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "createPieChart",
          name: "Create Pie Chart",
          description:
            "Create pie charts for visualizing proportions and percentages.",
          category: "default",
        },
        // Web Search Tools
        {
          type: "app-tool",
          id: "webSearch",
          name: "Web Search",
          description:
            "A web search tool for quick research and information gathering. Provides search results with titles, summaries, and URLs.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "webContent",
          name: "Web Content Extraction",
          description:
            "Extract and summarize content from specific web pages using URLs. Perfect for in-depth analysis of articles and documents.",
          category: "default",
        },
        // HTTP Tool
        {
          type: "app-tool",
          id: "http",
          name: "HTTP Request",
          description:
            "Make HTTP requests to external APIs. Supports GET, POST, PUT, DELETE methods with headers and query parameters.",
          category: "default",
        },
        // Code Execution Tools
        {
          type: "app-tool",
          id: "mini-javascript-execution",
          name: "JavaScript Execution",
          description:
            "Execute JavaScript code in a sandboxed environment. Useful for data processing and calculations.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "python-execution",
          name: "Python Execution",
          description:
            "Execute Python code in a sandboxed environment. Useful for data analysis and scientific computing.",
          category: "default",
        },
        // Agent Management Tools
        {
          type: "app-tool",
          id: "createAgent",
          name: "Create Agent",
          description:
            "Create a new AI agent with custom instructions, tools, and settings.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "updateAgent",
          name: "Update Agent",
          description:
            "Update an existing agent's properties including name, description, role, instructions, or tools.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "deleteAgent",
          name: "Delete Agent",
          description: "Delete an agent permanently (owner only).",
          category: "default",
        },
        {
          type: "app-tool",
          id: "listAgents",
          name: "List Agents",
          description:
            "List all agents accessible to you (your own agents plus shared agents).",
          category: "default",
        },
        // Workflow Management Tools
        {
          type: "app-tool",
          id: "createWorkflow",
          name: "Create Workflow",
          description:
            "Create a new workflow with basic metadata. Workflows are visual automation tools with nodes and edges.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "updateWorkflow",
          name: "Update Workflow",
          description:
            "Update an existing workflow's metadata (name, description, icon, visibility, published status).",
          category: "default",
        },
        {
          type: "app-tool",
          id: "deleteWorkflow",
          name: "Delete Workflow",
          description:
            "Delete a workflow permanently. Only the workflow owner can delete it.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "listWorkflows",
          name: "List Workflows",
          description:
            "List all workflows accessible to you (your own workflows plus shared workflows).",
          category: "default",
        },
        {
          type: "app-tool",
          id: "addNode",
          name: "Add Node",
          description:
            "Add a node (step) to a workflow. Supports all 8 node types: Input, LLM, Tool, HTTP, Template, Condition, Output, Note.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "updateNode",
          name: "Update Node",
          description:
            "Update an existing node's configuration in a workflow.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "deleteNode",
          name: "Delete Node",
          description:
            "Remove a node from a workflow. This will also delete any edges connected to this node.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "listNodes",
          name: "List Nodes",
          description:
            "List all nodes in a workflow with their types, names, descriptions, and configurations.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "addEdge",
          name: "Add Edge",
          description:
            "Connect two nodes in a workflow to define execution flow.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "deleteEdge",
          name: "Delete Edge",
          description: "Remove a connection between two nodes in a workflow.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "listEdges",
          name: "List Edges",
          description:
            "List all connections (edges) in a workflow, showing which nodes are connected.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "getWorkflowStructure",
          name: "Get Workflow Structure",
          description:
            "Get the complete structure of a workflow including metadata, all nodes, and all edges.",
          category: "default",
        },
        {
          type: "app-tool",
          id: "listAvailableTools",
          name: "List Available Tools",
          description:
            "List all available tools that can be used in Tool nodes, including MCP server tools and published workflow tools.",
          category: "default",
        },
      ];

      tools.push(...defaultTools);

      // 2. Get MCP Tools
      try {
        const mcpClients = await mcpClientsManager.getClients();
        for (const { id: serverId, client } of mcpClients) {
          const mcpInfo = client.getInfo();
          if (mcpInfo?.toolInfo) {
            for (const tool of mcpInfo.toolInfo) {
              tools.push({
                type: "mcp-tool",
                serverId,
                serverName: mcpInfo.name,
                id: tool.name,
                name: tool.name,
                description: tool.description || "No description available",
                category: "mcp",
                ...(includeSchemas && tool.inputSchema
                  ? { parameterSchema: tool.inputSchema }
                  : {}),
              });
            }
          }
        }
      } catch (error) {
        // MCP tools optional, continue without them
      }

      // 3. Get Workflow Tools (published workflows)
      try {
        const workflowTools = await workflowRepository.selectExecuteAbility(
          session.user.id,
        );
        for (const workflow of workflowTools) {
          tools.push({
            type: "workflow",
            id: workflow.id,
            name: workflow.name,
            description: workflow.description || "No description available",
            category: "workflow",
            isPublished: workflow.isPublished,
            visibility: workflow.visibility,
          });
        }
      } catch (error) {
        // Workflow tools optional, continue without them
      }

      // Group by category for better organization
      const grouped = {
        default: tools.filter((t) => t.category === "default"),
        mcp: tools.filter((t) => t.category === "mcp"),
        workflow: tools.filter((t) => t.category === "workflow"),
      };

      return {
        success: true,
        tools: {
          all: tools,
          byCategory: grouped,
        },
        summary: {
          total: tools.length,
          default: grouped.default.length,
          mcp: grouped.mcp.length,
          workflow: grouped.workflow.length,
        },
        message: `Found ${tools.length} available tools: ${grouped.default.length} default, ${grouped.mcp.length} MCP, ${grouped.workflow.length} workflow tools`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to list available tools",
      };
    }
  },
});
