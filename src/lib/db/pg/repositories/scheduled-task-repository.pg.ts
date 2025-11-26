import { pgDb as db } from "../db.pg";
import {
  ScheduledTaskTable,
  ScheduledTaskExecutionTable,
  ChatThreadTable,
} from "../schema.pg";
import { and, desc, eq, lte } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import type {
  ScheduledTask,
  ScheduledTaskExecution,
  CreateScheduledTaskInput,
  UpdateScheduledTaskInput,
} from "@/types/scheduled-task";

export interface ScheduledTaskRepository {
  insertScheduledTask(
    userId: string,
    input: CreateScheduledTaskInput,
  ): Promise<ScheduledTask>;
  selectScheduledTask(
    id: string,
    userId: string,
  ): Promise<ScheduledTask | null>;
  selectScheduledTasks(userId: string): Promise<ScheduledTask[]>;
  selectDueTasks(): Promise<ScheduledTask[]>;
  updateScheduledTask(
    id: string,
    userId: string,
    input: UpdateScheduledTaskInput,
  ): Promise<ScheduledTask>;
  deleteScheduledTask(id: string, userId: string): Promise<void>;
  updateLastRun(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date | null,
  ): Promise<void>;
  insertExecution(data: {
    scheduledTaskId: string;
    status: "pending" | "running" | "success" | "failed";
    startedAt: Date;
    threadId?: string;
  }): Promise<ScheduledTaskExecution>;
  updateExecution(
    id: string,
    data: {
      status?: "pending" | "running" | "success" | "failed";
      threadId?: string;
      error?: string;
      completedAt?: Date;
      duration?: string;
    },
  ): Promise<ScheduledTaskExecution>;
  selectExecutionHistory(
    scheduledTaskId: string,
    limit?: number,
  ): Promise<ScheduledTaskExecution[]>;
}

export const pgScheduledTaskRepository: ScheduledTaskRepository = {
  async insertScheduledTask(userId, input) {
    const [result] = await db
      .insert(ScheduledTaskTable)
      .values({
        id: generateUUID(),
        userId,
        name: input.name,
        description: input.description,
        prompt: input.prompt,
        schedule: input.schedule,
        enabled: input.enabled ?? true,
        agentId: input.agentId,
        chatModel: input.chatModel,
        toolChoice: input.toolChoice ?? "auto",
        mentions: input.mentions ?? [],
        allowedMcpServers: input.allowedMcpServers,
        allowedAppDefaultToolkit: input.allowedAppDefaultToolkit,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      ...result,
      schedule: result.schedule as any,
      description: result.description ?? undefined,
      agentId: result.agentId ?? undefined,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      lastRunAt: result.lastRunAt ?? undefined,
      nextRunAt: result.nextRunAt ?? undefined,
    };
  },

  async selectScheduledTask(id, userId) {
    const [result] = await db
      .select()
      .from(ScheduledTaskTable)
      .where(
        and(
          eq(ScheduledTaskTable.id, id),
          eq(ScheduledTaskTable.userId, userId),
        ),
      );

    if (!result) return null;

    return {
      ...result,
      schedule: result.schedule as any,
      description: result.description ?? undefined,
      agentId: result.agentId ?? undefined,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      lastRunAt: result.lastRunAt ?? undefined,
      nextRunAt: result.nextRunAt ?? undefined,
    };
  },

  async selectScheduledTasks(userId) {
    const results = await db
      .select()
      .from(ScheduledTaskTable)
      .where(eq(ScheduledTaskTable.userId, userId))
      .orderBy(desc(ScheduledTaskTable.createdAt));

    return results.map((result) => ({
      ...result,
      schedule: result.schedule as any,
      description: result.description ?? undefined,
      agentId: result.agentId ?? undefined,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      lastRunAt: result.lastRunAt ?? undefined,
      nextRunAt: result.nextRunAt ?? undefined,
    }));
  },

  async selectDueTasks() {
    const now = new Date();
    const results = await db
      .select()
      .from(ScheduledTaskTable)
      .where(
        and(
          eq(ScheduledTaskTable.enabled, true),
          lte(ScheduledTaskTable.nextRunAt, now),
        ),
      );

    return results.map((result) => ({
      ...result,
      schedule: result.schedule as any,
      description: result.description ?? undefined,
      agentId: result.agentId ?? undefined,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      lastRunAt: result.lastRunAt ?? undefined,
      nextRunAt: result.nextRunAt ?? undefined,
    }));
  },

  async updateScheduledTask(id, userId, input) {
    const [result] = await db
      .update(ScheduledTaskTable)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ScheduledTaskTable.id, id),
          eq(ScheduledTaskTable.userId, userId),
        ),
      )
      .returning();

    return {
      ...result,
      schedule: result.schedule as any,
      description: result.description ?? undefined,
      agentId: result.agentId ?? undefined,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      lastRunAt: result.lastRunAt ?? undefined,
      nextRunAt: result.nextRunAt ?? undefined,
    };
  },

  async deleteScheduledTask(id, userId) {
    await db
      .delete(ScheduledTaskTable)
      .where(
        and(
          eq(ScheduledTaskTable.id, id),
          eq(ScheduledTaskTable.userId, userId),
        ),
      );
  },

  async updateLastRun(id, lastRunAt, nextRunAt) {
    await db
      .update(ScheduledTaskTable)
      .set({
        lastRunAt,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(ScheduledTaskTable.id, id));
  },

  async insertExecution(data) {
    const [result] = await db
      .insert(ScheduledTaskExecutionTable)
      .values({
        id: generateUUID(),
        scheduledTaskId: data.scheduledTaskId,
        threadId: data.threadId,
        status: data.status,
        startedAt: data.startedAt,
      })
      .returning();

    return {
      ...result,
      threadId: result.threadId ?? undefined,
      error: result.error ?? undefined,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async updateExecution(id, data) {
    const [result] = await db
      .update(ScheduledTaskExecutionTable)
      .set(data)
      .where(eq(ScheduledTaskExecutionTable.id, id))
      .returning();

    return {
      ...result,
      threadId: result.threadId ?? undefined,
      error: result.error ?? undefined,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async selectExecutionHistory(scheduledTaskId, limit = 50) {
    const results = await db
      .select({
        id: ScheduledTaskExecutionTable.id,
        scheduledTaskId: ScheduledTaskExecutionTable.scheduledTaskId,
        threadId: ScheduledTaskExecutionTable.threadId,
        status: ScheduledTaskExecutionTable.status,
        error: ScheduledTaskExecutionTable.error,
        startedAt: ScheduledTaskExecutionTable.startedAt,
        completedAt: ScheduledTaskExecutionTable.completedAt,
        duration: ScheduledTaskExecutionTable.duration,
        threadTitle: ChatThreadTable.title,
      })
      .from(ScheduledTaskExecutionTable)
      .leftJoin(
        ChatThreadTable,
        eq(ScheduledTaskExecutionTable.threadId, ChatThreadTable.id),
      )
      .where(eq(ScheduledTaskExecutionTable.scheduledTaskId, scheduledTaskId))
      .orderBy(desc(ScheduledTaskExecutionTable.startedAt))
      .limit(limit);

    return results.map((result) => ({
      id: result.id,
      scheduledTaskId: result.scheduledTaskId,
      threadId: result.threadId ?? undefined,
      threadTitle: result.threadTitle ?? undefined,
      status: result.status,
      error: result.error ?? undefined,
      startedAt: result.startedAt,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    }));
  },
};
