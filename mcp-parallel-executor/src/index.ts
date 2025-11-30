#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { ClientManager } from "./client-manager.js";

// Load configuration and initialize client manager
const config = loadConfig();
const clientManager = new ClientManager(config);

// Define the server
const server = new Server(
  {
    name: "parallel-executor",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define schemas for our tool inputs
const OperationSchema = z.object({
  serverName: z
    .string()
    .describe("The name of the server to call (must be in servers.json)"),
  toolName: z.string().describe("The name of the tool to call on that server"),
  arguments: z.record(z.any()).describe("The arguments to pass to the tool"),
});

const ParallelExecuteArgsSchema = z.object({
  operations: z
    .array(OperationSchema)
    .describe("List of operations to perform"),
  stopOnError: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, stops subsequent operations if one fails"),
  maxConcurrent: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of concurrent operations"),
});

// Helper for concurrency control
async function pMap<T, R>(
  iterable: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: { concurrency: number; stopOnError: boolean },
): Promise<R[]> {
  const results: R[] = new Array(iterable.length);
  const queue = iterable.map((item, index) => ({ item, index }));
  let activeCount = 0;
  let hasError = false;
  let nextIndex = 0;

  return new Promise((resolve, _reject) => {
    const next = () => {
      if (hasError && options.stopOnError) return;
      if (nextIndex >= queue.length && activeCount === 0) {
        resolve(results);
        return;
      }

      while (activeCount < options.concurrency && nextIndex < queue.length) {
        const { item, index } = queue[nextIndex++];
        activeCount++;

        mapper(item, index)
          .then((res) => {
            results[index] = res;
          })
          .catch((err) => {
            if (options.stopOnError) {
              hasError = true;
              // If we stop on error, we might reject the whole promise or just let in-flight finish?
              // The requirement usually implies returning what we have + error.
              // For simplicity here, we'll store the error result.
              // NOTE: The mapper itself should catch errors to return a structured 'error' result
              // so this catch block is for unexpected crashes.
              console.error("Unexpected error in mapper:", err);
            }
          })
          .finally(() => {
            activeCount--;
            next();
          });
      }
    };
    next();
  });
}

// Tool Implementation
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tool: Tool = {
    name: "parallel_execute",
    description:
      "Executes multiple MCP tools concurrently across defined downstream servers.",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              serverName: { type: "string" },
              toolName: { type: "string" },
              arguments: { type: "object" },
            },
            required: ["serverName", "toolName", "arguments"],
          },
        },
        stopOnError: { type: "boolean" },
        maxConcurrent: { type: "number" },
      },
      required: ["operations"],
    },
  };

  return {
    tools: [tool],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "parallel_execute") {
    throw new Error("Unknown tool");
  }

  const parseResult = ParallelExecuteArgsSchema.safeParse(
    request.params.arguments,
  );
  if (!parseResult.success) {
    throw new Error(`Invalid arguments: ${parseResult.error.message}`);
  }

  const { operations, stopOnError, maxConcurrent } = parseResult.data;

  // Function to execute a single operation
  const executeOperation = async (op: z.infer<typeof OperationSchema>) => {
    try {
      const client = await clientManager.getClient(op.serverName);
      const result = await client.callTool({
        name: op.toolName,
        arguments: op.arguments,
      });
      return {
        status: "success",
        operation: op,
        result: result,
      };
    } catch (error: any) {
      // If stopOnError is true, this error will bubble up if we rethrow.
      // But usually, we want to return the error structure.
      // If stopOnError is handled by the scheduler, we return a failed status.
      return {
        status: "error",
        operation: op,
        error: error.message || String(error),
      };
    }
  };

  // Run with concurrency
  const results = await pMap(operations, executeOperation, {
    concurrency: maxConcurrent,
    stopOnError,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
});

// Start server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Parallel Executor MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await clientManager.closeAll();
  process.exit(0);
});
