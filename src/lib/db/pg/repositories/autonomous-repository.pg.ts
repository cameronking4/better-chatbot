import { pgDb as db } from "../db.pg";
import {
  AutonomousSessionTable,
  AutonomousIterationTable,
  AutonomousObservationTable,
  AgentTable,
} from "../schema.pg";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import type {
  AutonomousSession,
  AutonomousIteration,
  AutonomousObservation,
  CreateAutonomousSessionInput,
  UpdateAutonomousSessionInput,
  SessionSummary,
  AutonomousSessionStatus,
  AutonomousIterationPhase,
  AutonomousObservationType,
  ProgressEvaluation,
  ActionPlan,
  IterationResult,
} from "@/types/autonomous";

export interface AutonomousRepository {
  // Session operations
  insertSession(
    userId: string,
    input: CreateAutonomousSessionInput,
  ): Promise<AutonomousSession>;
  selectSession(id: string, userId: string): Promise<AutonomousSession | null>;
  selectSessions(userId: string): Promise<AutonomousSession[]>;
  selectSessionsByStatus(
    userId: string,
    statuses: AutonomousSessionStatus[],
  ): Promise<AutonomousSession[]>;
  selectSessionSummaries(userId: string): Promise<SessionSummary[]>;
  updateSession(
    id: string,
    userId: string,
    input: UpdateAutonomousSessionInput,
  ): Promise<AutonomousSession>;
  updateSessionActivity(id: string): Promise<void>;
  deleteSession(id: string, userId: string): Promise<void>;

  // Iteration operations
  insertIteration(data: {
    sessionId: string;
    iterationNumber: number;
    phase: AutonomousIterationPhase;
    threadId?: string;
  }): Promise<AutonomousIteration>;
  updateIteration(
    id: string,
    data: {
      phase?: AutonomousIterationPhase;
      evaluation?: ProgressEvaluation;
      plan?: ActionPlan;
      result?: IterationResult;
      completedAt?: Date;
      duration?: string;
    },
  ): Promise<AutonomousIteration>;
  selectIterations(sessionId: string): Promise<AutonomousIteration[]>;
  selectLatestIteration(
    sessionId: string,
  ): Promise<AutonomousIteration | null>;

  // Observation operations
  insertObservation(data: {
    sessionId: string;
    iterationId?: string;
    type: AutonomousObservationType;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<AutonomousObservation>;
  selectObservations(sessionId: string): Promise<AutonomousObservation[]>;
  selectObservationsByIteration(
    iterationId: string,
  ): Promise<AutonomousObservation[]>;
}

export const pgAutonomousRepository: AutonomousRepository = {
  // Session operations
  async insertSession(userId, input) {
    const [result] = await db
      .insert(AutonomousSessionTable)
      .values({
        id: generateUUID(),
        userId,
        agentId: input.agentId,
        name: input.name,
        goal: input.goal,
        maxIterations: input.maxIterations ?? 20,
        currentIteration: 0,
        chatModel: input.chatModel,
        toolChoice: input.toolChoice ?? "auto",
        mentions: input.mentions ?? [],
        allowedMcpServers: input.allowedMcpServers,
        allowedAppDefaultToolkit: input.allowedAppDefaultToolkit,
        progressPercentage: 0,
        status: "planning",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .returning();

    return {
      id: result.id,
      userId: result.userId,
      agentId: result.agentId ?? undefined,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      maxIterations: result.maxIterations as number,
      currentIteration: result.currentIteration as number,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      progressPercentage: result.progressPercentage as number,
      error: result.error ?? undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lastActivityAt: result.lastActivityAt,
    };
  },

  async selectSession(id, userId) {
    const [result] = await db
      .select()
      .from(AutonomousSessionTable)
      .where(
        and(
          eq(AutonomousSessionTable.id, id),
          eq(AutonomousSessionTable.userId, userId),
        ),
      );

    if (!result) return null;

    return {
      id: result.id,
      userId: result.userId,
      agentId: result.agentId ?? undefined,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      maxIterations: result.maxIterations as number,
      currentIteration: result.currentIteration as number,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      progressPercentage: result.progressPercentage as number,
      error: result.error ?? undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lastActivityAt: result.lastActivityAt,
    };
  },

  async selectSessions(userId) {
    const results = await db
      .select()
      .from(AutonomousSessionTable)
      .where(eq(AutonomousSessionTable.userId, userId))
      .orderBy(desc(AutonomousSessionTable.lastActivityAt));

    return results.map((result) => ({
      id: result.id,
      userId: result.userId,
      agentId: result.agentId ?? undefined,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      maxIterations: result.maxIterations as number,
      currentIteration: result.currentIteration as number,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      progressPercentage: result.progressPercentage as number,
      error: result.error ?? undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lastActivityAt: result.lastActivityAt,
    }));
  },

  async selectSessionsByStatus(userId, statuses) {
    const results = await db
      .select()
      .from(AutonomousSessionTable)
      .where(
        and(
          eq(AutonomousSessionTable.userId, userId),
          inArray(AutonomousSessionTable.status, statuses),
        ),
      )
      .orderBy(desc(AutonomousSessionTable.lastActivityAt));

    return results.map((result) => ({
      id: result.id,
      userId: result.userId,
      agentId: result.agentId ?? undefined,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      maxIterations: result.maxIterations as number,
      currentIteration: result.currentIteration as number,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      progressPercentage: result.progressPercentage as number,
      error: result.error ?? undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lastActivityAt: result.lastActivityAt,
    }));
  },

  async selectSessionSummaries(userId) {
    const results = await db
      .select({
        id: AutonomousSessionTable.id,
        name: AutonomousSessionTable.name,
        goal: AutonomousSessionTable.goal,
        status: AutonomousSessionTable.status,
        progressPercentage: AutonomousSessionTable.progressPercentage,
        currentIteration: AutonomousSessionTable.currentIteration,
        maxIterations: AutonomousSessionTable.maxIterations,
        agentId: AutonomousSessionTable.agentId,
        agentName: AgentTable.name,
        createdAt: AutonomousSessionTable.createdAt,
        lastActivityAt: AutonomousSessionTable.lastActivityAt,
        iterationCount: count(AutonomousIterationTable.id),
        observationCount: count(AutonomousObservationTable.id),
      })
      .from(AutonomousSessionTable)
      .leftJoin(
        AgentTable,
        eq(AutonomousSessionTable.agentId, AgentTable.id),
      )
      .leftJoin(
        AutonomousIterationTable,
        eq(AutonomousSessionTable.id, AutonomousIterationTable.sessionId),
      )
      .leftJoin(
        AutonomousObservationTable,
        eq(AutonomousSessionTable.id, AutonomousObservationTable.sessionId),
      )
      .where(eq(AutonomousSessionTable.userId, userId))
      .groupBy(
        AutonomousSessionTable.id,
        AutonomousSessionTable.name,
        AutonomousSessionTable.goal,
        AutonomousSessionTable.status,
        AutonomousSessionTable.progressPercentage,
        AutonomousSessionTable.currentIteration,
        AutonomousSessionTable.maxIterations,
        AutonomousSessionTable.agentId,
        AgentTable.name,
        AutonomousSessionTable.createdAt,
        AutonomousSessionTable.lastActivityAt,
      )
      .orderBy(desc(AutonomousSessionTable.lastActivityAt));

    return results.map((result) => ({
      id: result.id,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      progressPercentage: result.progressPercentage as number,
      currentIteration: result.currentIteration as number,
      maxIterations: result.maxIterations as number,
      agentName: result.agentName ?? undefined,
      createdAt: result.createdAt,
      lastActivityAt: result.lastActivityAt,
      iterationCount: result.iterationCount,
      observationCount: result.observationCount,
    }));
  },

  async updateSession(id, userId, input) {
    const [result] = await db
      .update(AutonomousSessionTable)
      .set({
        ...input,
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(
        and(
          eq(AutonomousSessionTable.id, id),
          eq(AutonomousSessionTable.userId, userId),
        ),
      )
      .returning();

    return {
      id: result.id,
      userId: result.userId,
      agentId: result.agentId ?? undefined,
      name: result.name,
      goal: result.goal,
      status: result.status as AutonomousSessionStatus,
      maxIterations: result.maxIterations as number,
      currentIteration: result.currentIteration as number,
      chatModel: result.chatModel ?? undefined,
      toolChoice: result.toolChoice ?? undefined,
      mentions: result.mentions ?? [],
      allowedMcpServers: result.allowedMcpServers ?? undefined,
      allowedAppDefaultToolkit: result.allowedAppDefaultToolkit ?? undefined,
      progressPercentage: result.progressPercentage as number,
      error: result.error ?? undefined,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      lastActivityAt: result.lastActivityAt,
    };
  },

  async updateSessionActivity(id) {
    await db
      .update(AutonomousSessionTable)
      .set({
        lastActivityAt: new Date(),
      })
      .where(eq(AutonomousSessionTable.id, id));
  },

  async deleteSession(id, userId) {
    await db
      .delete(AutonomousSessionTable)
      .where(
        and(
          eq(AutonomousSessionTable.id, id),
          eq(AutonomousSessionTable.userId, userId),
        ),
      );
  },

  // Iteration operations
  async insertIteration(data) {
    const [result] = await db
      .insert(AutonomousIterationTable)
      .values({
        id: generateUUID(),
        sessionId: data.sessionId,
        iterationNumber: data.iterationNumber,
        threadId: data.threadId,
        phase: data.phase,
        startedAt: new Date(),
      })
      .returning();

    return {
      id: result.id,
      sessionId: result.sessionId,
      iterationNumber: result.iterationNumber as number,
      threadId: result.threadId ?? undefined,
      phase: result.phase as AutonomousIterationPhase,
      evaluation: result.evaluation ?? undefined,
      plan: result.plan ?? undefined,
      result: result.result ?? undefined,
      startedAt: result.startedAt,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async updateIteration(id, data) {
    const [result] = await db
      .update(AutonomousIterationTable)
      .set(data)
      .where(eq(AutonomousIterationTable.id, id))
      .returning();

    return {
      id: result.id,
      sessionId: result.sessionId,
      iterationNumber: result.iterationNumber as number,
      threadId: result.threadId ?? undefined,
      phase: result.phase as AutonomousIterationPhase,
      evaluation: result.evaluation ?? undefined,
      plan: result.plan ?? undefined,
      result: result.result ?? undefined,
      startedAt: result.startedAt,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  async selectIterations(sessionId) {
    const results = await db
      .select()
      .from(AutonomousIterationTable)
      .where(eq(AutonomousIterationTable.sessionId, sessionId))
      .orderBy(AutonomousIterationTable.iterationNumber);

    return results.map((result) => ({
      id: result.id,
      sessionId: result.sessionId,
      iterationNumber: result.iterationNumber as number,
      threadId: result.threadId ?? undefined,
      phase: result.phase as AutonomousIterationPhase,
      evaluation: result.evaluation ?? undefined,
      plan: result.plan ?? undefined,
      result: result.result ?? undefined,
      startedAt: result.startedAt,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    }));
  },

  async selectLatestIteration(sessionId) {
    const [result] = await db
      .select()
      .from(AutonomousIterationTable)
      .where(eq(AutonomousIterationTable.sessionId, sessionId))
      .orderBy(desc(AutonomousIterationTable.iterationNumber))
      .limit(1);

    if (!result) return null;

    return {
      id: result.id,
      sessionId: result.sessionId,
      iterationNumber: result.iterationNumber as number,
      threadId: result.threadId ?? undefined,
      phase: result.phase as AutonomousIterationPhase,
      evaluation: result.evaluation ?? undefined,
      plan: result.plan ?? undefined,
      result: result.result ?? undefined,
      startedAt: result.startedAt,
      completedAt: result.completedAt ?? undefined,
      duration: result.duration ?? undefined,
    };
  },

  // Observation operations
  async insertObservation(data) {
    const [result] = await db
      .insert(AutonomousObservationTable)
      .values({
        id: generateUUID(),
        sessionId: data.sessionId,
        iterationId: data.iterationId,
        type: data.type,
        content: data.content,
        metadata: data.metadata,
        createdAt: new Date(),
      })
      .returning();

    return {
      id: result.id,
      sessionId: result.sessionId,
      iterationId: result.iterationId ?? undefined,
      type: result.type as AutonomousObservationType,
      content: result.content,
      metadata: result.metadata ?? undefined,
      createdAt: result.createdAt,
    };
  },

  async selectObservations(sessionId) {
    const results = await db
      .select()
      .from(AutonomousObservationTable)
      .where(eq(AutonomousObservationTable.sessionId, sessionId))
      .orderBy(AutonomousObservationTable.createdAt);

    return results.map((result) => ({
      id: result.id,
      sessionId: result.sessionId,
      iterationId: result.iterationId ?? undefined,
      type: result.type as AutonomousObservationType,
      content: result.content,
      metadata: result.metadata ?? undefined,
      createdAt: result.createdAt,
    }));
  },

  async selectObservationsByIteration(iterationId) {
    const results = await db
      .select()
      .from(AutonomousObservationTable)
      .where(eq(AutonomousObservationTable.iterationId, iterationId))
      .orderBy(AutonomousObservationTable.createdAt);

    return results.map((result) => ({
      id: result.id,
      sessionId: result.sessionId,
      iterationId: result.iterationId ?? undefined,
      type: result.type as AutonomousObservationType,
      content: result.content,
      metadata: result.metadata ?? undefined,
      createdAt: result.createdAt,
    }));
  },
};
