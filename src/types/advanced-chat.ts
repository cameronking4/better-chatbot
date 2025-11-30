import { z } from "zod";
import { ChatModel, ChatMention } from "./chat";
import { UIMessage } from "ai";

export type AdvancedChatJobStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface AdvancedChatJob {
  id: string;
  threadId: string;
  userId: string;
  status: AdvancedChatJobStatus;
  currentIteration: number;
  correlationId: string;
  metadata: AdvancedChatJobMetadata;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface AdvancedChatJobMetadata {
  chatModel?: ChatModel;
  toolChoice?: "auto" | "none" | "manual";
  mentions?: ChatMention[];
  allowedMcpServers?: Record<string, any>;
  allowedAppDefaultToolkit?: string[];
  imageTool?: { model?: string };
  agentId?: string;
}

export interface AdvancedChatIteration {
  id: string;
  jobId: string;
  iterationNumber: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextSummaryId?: string;
  messagesSnapshot: UIMessage[];
  toolCalls: ToolCallTrace[];
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export interface ToolCallTrace {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  duration: number;
  tokensUsed?: number;
  startedAt: Date;
  completedAt: Date;
}

export interface AdvancedChatContextSummary {
  id: string;
  jobId: string;
  summaryText: string;
  messagesSummarized: number;
  tokenCountBefore: number;
  tokenCountAfter: number;
  createdAt: Date;
}

export const advancedChatApiRequestBodySchema = z.object({
  id: z.string(),
  message: z.any() as z.ZodType<UIMessage>,
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.enum(["auto", "none", "manual"]),
  mentions: z.array(z.any()).optional(),
  imageTool: z.object({ model: z.string().optional() }).optional(),
  allowedMcpServers: z.record(z.string(), z.any()).optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
  attachments: z.array(z.any()).optional(),
});

export type AdvancedChatApiRequestBody = z.infer<
  typeof advancedChatApiRequestBodySchema
>;
