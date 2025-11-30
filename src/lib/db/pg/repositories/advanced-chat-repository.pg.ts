import { pgDb as db } from "../db.pg";
import {
  AdvancedChatJobTable,
  AdvancedChatIterationTable,
  AdvancedChatContextSummaryTable,
} from "../schema.pg";
import { and, desc, eq } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import type {
  AdvancedChatJob,
  AdvancedChatIteration,
  AdvancedChatContextSummary,
  AdvancedChatJobMetadata,
  ToolCallTrace,
} from "@/types/advanced-chat";
import { UIMessage } from "ai";

export interface AdvancedChatRepository {
  insertJob(data: {
    threadId: string;
    userId: string;
    correlationId: string;
    metadata: AdvancedChatJobMetadata;
  }): Promise<AdvancedChatJob>;

  selectJob(id: string, userId: string): Promise<AdvancedChatJob | null>;

  selectJobByCorrelationId(
    correlationId: string,
  ): Promise<AdvancedChatJob | null>;

  selectJobsByThreadId(threadId: string): Promise<AdvancedChatJob[]>;

  selectJobsByUserId(userId: string): Promise<AdvancedChatJob[]>;

  updateJob(
    id: string,
    data: {
      status?: AdvancedChatJob["status"];
      currentIteration?: number;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      metadata?: AdvancedChatJobMetadata;
    },
  ): Promise<AdvancedChatJob>;

  insertIteration(data: {
    jobId: string;
    iterationNumber: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextSummaryId?: string;
    messagesSnapshot: UIMessage[];
    toolCalls?: ToolCallTrace[];
    error?: string;
    duration?: number;
  }): Promise<AdvancedChatIteration>;

  selectIterationsByJobId(jobId: string): Promise<AdvancedChatIteration[]>;

  selectIteration(id: string): Promise<AdvancedChatIteration | null>;

  insertContextSummary(data: {
    jobId: string;
    summaryText: string;
    messagesSummarized: number;
    tokenCountBefore: number;
    tokenCountAfter: number;
  }): Promise<AdvancedChatContextSummary>;

  selectContextSummariesByJobId(
    jobId: string,
  ): Promise<AdvancedChatContextSummary[]>;
}

export const pgAdvancedChatRepository: AdvancedChatRepository = {
  async insertJob(data) {
    const [result] = await db
      .insert(AdvancedChatJobTable)
      .values({
        id: generateUUID(),
        threadId: data.threadId,
        userId: data.userId,
        correlationId: data.correlationId,
        metadata: data.metadata,
        status: "pending",
        currentIteration: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    };
  },

  async selectJob(id, userId) {
    const [result] = await db
      .select()
      .from(AdvancedChatJobTable)
      .where(
        and(
          eq(AdvancedChatJobTable.id, id),
          eq(AdvancedChatJobTable.userId, userId),
        ),
      );

    if (!result) return null;

    return {
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    };
  },

  async selectJobByCorrelationId(correlationId) {
    const [result] = await db
      .select()
      .from(AdvancedChatJobTable)
      .where(eq(AdvancedChatJobTable.correlationId, correlationId));

    if (!result) return null;

    return {
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    };
  },

  async selectJobsByThreadId(threadId) {
    const results = await db
      .select()
      .from(AdvancedChatJobTable)
      .where(eq(AdvancedChatJobTable.threadId, threadId))
      .orderBy(desc(AdvancedChatJobTable.createdAt));

    return results.map((result) => ({
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    }));
  },

  async selectJobsByUserId(userId) {
    const results = await db
      .select()
      .from(AdvancedChatJobTable)
      .where(eq(AdvancedChatJobTable.userId, userId))
      .orderBy(desc(AdvancedChatJobTable.createdAt));

    return results.map((result) => ({
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    }));
  },

  async updateJob(id, data) {
    const [result] = await db
      .update(AdvancedChatJobTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(AdvancedChatJobTable.id, id))
      .returning();

    if (!result) {
      throw new Error(`Job ${id} not found`);
    }

    return {
      ...result,
      metadata: result.metadata as AdvancedChatJobMetadata,
      startedAt: result.startedAt ?? undefined,
      completedAt: result.completedAt ?? undefined,
      error: result.error ?? undefined,
    };
  },

  async insertIteration(data) {
    const [result] = await db
      .insert(AdvancedChatIterationTable)
      .values({
        id: generateUUID(),
        jobId: data.jobId,
        iterationNumber: data.iterationNumber,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.totalTokens,
        contextSummaryId: data.contextSummaryId,
        messagesSnapshot: data.messagesSnapshot as any,
        toolCalls: data.toolCalls as any,
        error: data.error,
        startedAt: new Date(),
        completedAt: data.duration ? new Date() : undefined,
        duration: data.duration,
      })
      .returning();

    return {
      ...result,
      contextSummaryId: result.contextSummaryId ?? undefined,
      toolCalls: (result.toolCalls as ToolCallTrace[]) ?? [],
      error: result.error ?? undefined,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async selectIterationsByJobId(jobId) {
    const results = await db
      .select()
      .from(AdvancedChatIterationTable)
      .where(eq(AdvancedChatIterationTable.jobId, jobId))
      .orderBy(AdvancedChatIterationTable.iterationNumber);

    return results.map((result) => ({
      ...result,
      contextSummaryId: result.contextSummaryId ?? undefined,
      toolCalls: (result.toolCalls as ToolCallTrace[]) ?? [],
      error: result.error ?? undefined,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    }));
  },

  async selectIteration(id) {
    const [result] = await db
      .select()
      .from(AdvancedChatIterationTable)
      .where(eq(AdvancedChatIterationTable.id, id));

    if (!result) return null;

    return {
      ...result,
      contextSummaryId: result.contextSummaryId ?? undefined,
      toolCalls: (result.toolCalls as ToolCallTrace[]) ?? [],
      error: result.error ?? undefined,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async insertContextSummary(data) {
    const [result] = await db
      .insert(AdvancedChatContextSummaryTable)
      .values({
        id: generateUUID(),
        jobId: data.jobId,
        summaryText: data.summaryText,
        messagesSummarized: data.messagesSummarized,
        tokenCountBefore: data.tokenCountBefore,
        tokenCountAfter: data.tokenCountAfter,
        createdAt: new Date(),
      })
      .returning();

    return result;
  },

  async selectContextSummariesByJobId(jobId) {
    const results = await db
      .select()
      .from(AdvancedChatContextSummaryTable)
      .where(eq(AdvancedChatContextSummaryTable.jobId, jobId))
      .orderBy(AdvancedChatContextSummaryTable.createdAt);

    return results;
  },
};
