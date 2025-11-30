import "server-only";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { agentRepository } from "lib/db/repository";
import { validateApiKeyFromHeader } from "lib/auth/api-key-auth";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { loadMcpTools } from "@/app/api/chat/shared.chat";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";
import { workflowRepository } from "lib/db/repository";
import { z } from "zod";
import logger from "logger";
import { colorize } from "consola/utils";

const mcpLogger = logger.withDefaults({
  message: colorize("blackBright", `Agent MCP Server: `),
});

export const maxDuration = 300;

async function loadAgentTools(agentId: string, userId: string) {
  const agent = await agentRepository.selectAgentById(agentId, userId);
  if (!agent) {
    throw new Error("Agent not found");
  }

  const mentions = agent.instructions?.mentions || [];
  const toolList: Array<{
    name: string;
    description: string;
    type: "mcp" | "default" | "workflow";
  }> = [];

  // Load MCP tools
  const mcpTools = await loadMcpTools({ mentions });
  for (const [toolName, tool] of Object.entries(mcpTools)) {
    toolList.push({
      name: toolName,
      description: tool.description || `MCP tool: ${toolName}`,
      type: "mcp",
    });
  }

  // Load default tools
  const defaultTools = await loadAppDefaultTools({ mentions });
  for (const [toolName, tool] of Object.entries(defaultTools)) {
    toolList.push({
      name: toolName,
      description: tool.description || `Default tool: ${toolName}`,
      type: "default",
    });
  }

  // Load workflow tools
  const workflowTools = await workflowRepository.selectExecuteAbility(userId);
  const workflowMentions = mentions.filter((m) => m.type === "workflow");
  for (const mention of workflowMentions) {
    if (mention.type === "workflow") {
      const workflow = workflowTools.find((w) => w.id === mention.workflowId);
      if (workflow) {
        toolList.push({
          name: workflow.name,
          description: workflow.description || `Workflow: ${workflow.name}`,
          type: "workflow",
        });
      }
    }
  }

  return { agent, toolList, mentions };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    // Authenticate using API key
    const apiKeyAuth = await validateApiKeyFromHeader(request);
    if (!apiKeyAuth) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unauthorized" },
          id: null,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const { agentId } = await params;
    const userId = apiKeyAuth.userId;

    // Load agent and tools
    const { agent, toolList, mentions } = await loadAgentTools(agentId, userId);

    // Create MCP server
    const server = new McpServer({
      name: `agent-${agent.name}`,
      version: "1.0.0",
    });

    // Register list_tools tool
    server.registerTool(
      "list_tools",
      {
        title: "List Tools",
        description: "Lists all tools available from this agent",
        inputSchema: z.object({}),
        outputSchema: z.object({
          tools: z.array(
            z.object({
              name: z.string(),
              description: z.string(),
              type: z.enum(["mcp", "default", "workflow"]),
            }),
          ),
        }),
      },
      async () => {
        const output = { tools: toolList };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );

    // Register getInstructions tool
    server.registerTool(
      "getInstructions",
      {
        title: "Get Instructions",
        description:
          "Returns the agent's instructions including role, system prompt, and tool mentions",
        inputSchema: z.object({}),
        outputSchema: z.object({
          role: z.string().optional(),
          systemPrompt: z.string().optional(),
          mentions: z.array(z.any()).optional(),
        }),
      },
      async () => {
        const output = {
          role: agent.instructions?.role,
          systemPrompt: agent.instructions?.systemPrompt,
          mentions: agent.instructions?.mentions || [],
        };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );

    // Register delegateToAgent tool
    server.registerTool(
      "delegateToAgent",
      {
        title: "Delegate To Agent",
        description:
          "Calls the chat route using this agent and returns the response",
        inputSchema: z.object({
          message: z.string().describe("The user message to send to the agent"),
          chatModel: z
            .object({
              provider: z.string(),
              model: z.string(),
            })
            .optional()
            .describe("Optional chat model configuration"),
        }),
        outputSchema: z.object({
          response: z.string(),
        }),
      },
      async ({ message, chatModel }) => {
        try {
          // Get base URL
          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : "http://localhost:3000";

          // Get API key from request
          const authHeader = request.headers.get("Authorization");
          if (!authHeader) {
            throw new Error("No authorization header");
          }

          // Call internal chat API
          const chatResponse = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify({
              id: randomUUID(),
              message: {
                id: randomUUID(),
                role: "user",
                parts: [{ type: "text", text: message }],
              },
              chatModel: chatModel || { provider: "openai", model: "gpt-4" },
              toolChoice: "auto",
              mentions: [
                {
                  type: "agent",
                  agentId: agentId,
                  name: agent.name,
                },
              ],
              attachments: [],
            }),
          });

          if (!chatResponse.ok) {
            const errorText = await chatResponse.text();
            throw new Error(`Chat API error: ${errorText}`);
          }

          // Read streaming response
          const reader = chatResponse.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let fullResponse = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last incomplete line in buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              // Handle data stream format: "0:{...}" or "data: {...}"
              let jsonStr = "";
              if (line.startsWith("0:")) {
                jsonStr = line.slice(2);
              } else if (line.startsWith("data: ")) {
                jsonStr = line.slice(6);
              } else {
                continue;
              }

              try {
                const data = JSON.parse(jsonStr);
                // Accumulate text deltas
                if (data.type === "text-delta" && data.delta) {
                  fullResponse += data.delta;
                } else if (data.type === "text" && data.text) {
                  fullResponse += data.text;
                } else if (data.type === "finish") {
                  // Stream finished
                  break;
                }
              } catch (_e) {
                // Skip invalid JSON
                mcpLogger.warn("Failed to parse stream line:", line);
              }
            }
          }

          const output = { response: fullResponse || "No response received" };
          return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error: any) {
          mcpLogger.error("Error delegating to agent:", error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error.message || "Failed to delegate to agent",
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Forward agent tools as MCP tools
    // Load MCP tools and register them
    const mcpTools = await loadMcpTools({ mentions });
    for (const [toolName, tool] of Object.entries(mcpTools)) {
      server.registerTool(
        toolName,
        {
          title: tool.description || toolName,
          description: tool.description || `Forwarded MCP tool: ${toolName}`,
          inputSchema: (tool.inputSchema as z.ZodTypeAny) || z.object({}),
          outputSchema: z.any(),
        },
        async (args) => {
          try {
            const result = await mcpClientsManager.toolCall(
              tool._mcpServerId,
              tool._originToolName,
              args,
            );
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: error.message || "Tool execution failed",
                  }),
                },
              ],
              isError: true,
            };
          }
        },
      );
    }

    // Forward default tools
    const defaultTools = await loadAppDefaultTools({ mentions });
    for (const [toolName, tool] of Object.entries(defaultTools)) {
      server.registerTool(
        toolName,
        {
          title: tool.description || toolName,
          description:
            tool.description || `Forwarded default tool: ${toolName}`,
          inputSchema: (tool.inputSchema as z.ZodTypeAny) || z.object({}),
          outputSchema: z.any(),
        },
        async (args) => {
          try {
            if (!tool.execute) {
              throw new Error("Tool has no execute function");
            }
            const result = await tool.execute(args, {
              toolCallId: randomUUID(),
              abortSignal: request.signal,
              messages: [],
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: error.message || "Tool execution failed",
                  }),
                },
              ],
              isError: true,
            };
          }
        },
      );
    }

    // Forward workflow tools
    const workflowTools = await workflowRepository.selectExecuteAbility(userId);
    const workflowMentions = mentions.filter((m) => m.type === "workflow");
    for (const mention of workflowMentions) {
      if (mention.type === "workflow") {
        const workflow = workflowTools.find((w) => w.id === mention.workflowId);
        if (workflow) {
          server.registerTool(
            workflow.name,
            {
              title: workflow.description || workflow.name,
              description:
                workflow.description || `Forwarded workflow: ${workflow.name}`,
              inputSchema: z.object({}),
              outputSchema: z.any(),
            },
            async (args) => {
              try {
                // Call workflow execution API
                const baseUrl =
                  process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
                    ? `https://${process.env.VERCEL_URL}`
                    : "http://localhost:3000";

                const authHeader = request.headers.get("Authorization");
                const workflowResponse = await fetch(
                  `${baseUrl}/api/workflow/${mention.workflowId}/execute`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: authHeader || "",
                    },
                    body: JSON.stringify({ query: args }),
                  },
                );

                if (!workflowResponse.ok) {
                  const errorText = await workflowResponse.text();
                  throw new Error(`Workflow execution error: ${errorText}`);
                }

                const result = await workflowResponse.json();
                return {
                  content: [{ type: "text", text: JSON.stringify(result) }],
                  structuredContent: result,
                };
              } catch (error: any) {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        error: error.message || "Workflow execution failed",
                      }),
                    },
                  ],
                  isError: true,
                };
              }
            },
          );
        }
      }
    }

    // Create transport and handle request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    request.signal.addEventListener("abort", () => {
      transport.close();
    });

    await server.connect(transport);

    // Parse request body
    const body = await request.json();

    // Create a Response stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Create a mock response object compatible with Node.js HTTP Response
        // with EventEmitter support
        const eventHandlers: Record<
          string,
          Array<(...args: any[]) => void>
        > = {};
        const mockRes = {
          write: (chunk: string | Buffer) => {
            const data = typeof chunk === "string" ? chunk : chunk.toString();
            controller.enqueue(encoder.encode(data));
            return true;
          },
          end: (chunk?: string | Buffer) => {
            if (chunk) {
              const data = typeof chunk === "string" ? chunk : chunk.toString();
              controller.enqueue(encoder.encode(data));
            }
            // Emit 'finish' event
            if (eventHandlers["finish"]) {
              eventHandlers["finish"].forEach((handler) => handler());
            }
            controller.close();
          },
          writeHead: (
            statusCode: number,
            statusMessage?: string | Record<string, string>,
            headers?: Record<string, string>,
          ) => {
            mockRes.statusCode = statusCode;
            if (typeof statusMessage === "object") {
              Object.assign(mockRes.headers, statusMessage);
            } else if (headers) {
              Object.assign(mockRes.headers, headers);
            }
            mockRes.headersSent = true;
            return mockRes;
          },
          setHeader: (name: string, value: string) => {
            mockRes.headers[name] = value;
          },
          getHeader: (name: string) => {
            return mockRes.headers[name];
          },
          removeHeader: (name: string) => {
            delete mockRes.headers[name];
          },
          on: (event: string, handler: (...args: any[]) => void) => {
            if (!eventHandlers[event]) {
              eventHandlers[event] = [];
            }
            eventHandlers[event].push(handler);
            return mockRes;
          },
          once: (event: string, handler: (...args: any[]) => void) => {
            const onceHandler = (...args: any[]) => {
              handler(...args);
              mockRes.off(event, onceHandler);
            };
            return mockRes.on(event, onceHandler);
          },
          off: (event: string, handler: (...args: any[]) => void) => {
            if (eventHandlers[event]) {
              eventHandlers[event] = eventHandlers[event].filter(
                (h) => h !== handler,
              );
            }
            return mockRes;
          },
          emit: (event: string, ...args: any[]) => {
            if (eventHandlers[event]) {
              eventHandlers[event].forEach((handler) => handler(...args));
            }
            return true;
          },
          statusCode: 200,
          statusMessage: "OK",
          status: (code: number) => {
            mockRes.statusCode = code;
            return mockRes;
          },
          json: (data: any) => {
            controller.enqueue(encoder.encode(JSON.stringify(data)));
            controller.close();
            return mockRes;
          },
          headers: {} as Record<string, string>,
          headersSent: false,
        };

        // Create a mock request object
        const mockReq = {
          method: request.method,
          url: new URL(request.url).pathname,
          headers: Object.fromEntries(request.headers.entries()),
          body: body,
        };

        try {
          await transport.handleRequest(mockReq as any, mockRes as any, body);
        } catch (error: any) {
          mcpLogger.error("Transport handleRequest error:", error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: error.message || "Internal server error",
                },
                id: body.id || null,
              }),
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    mcpLogger.error("MCP server error:", error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error.message || "Internal server error",
        },
        id: null,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
