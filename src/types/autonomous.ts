import { ChatMention } from "./chat";
import { AllowedMCPServer } from "./mcp";
import { AppDefaultToolkit } from "lib/ai/tools";

export type AutonomousSessionStatus =
  | "planning"
  | "executing"
  | "paused"
  | "completed"
  | "failed";

export type AutonomousIterationPhase =
  | "evaluating"
  | "planning"
  | "executing"
  | "observing";

export type AutonomousObservationType =
  | "evaluation"
  | "planning"
  | "execution"
  | "tool_call"
  | "error"
  | "user_intervention";

export interface ProgressEvaluation {
  goalAchieved: boolean;
  progressPercentage: number;
  blockers?: string[];
  recommendations?: string[];
  shouldContinue: boolean;
}

export interface ActionPlan {
  action: string;
  rationale: string;
  expectedOutcome: string;
}

export interface IterationResult {
  success: boolean;
  output?: any;
  error?: string;
}

export interface AutonomousSession {
  id: string;
  userId: string;
  agentId?: string;
  name: string;
  goal: string;
  status: AutonomousSessionStatus;
  maxIterations: number;
  currentIteration: number;
  chatModel?: {
    provider: string;
    model: string;
  };
  toolChoice?: string;
  mentions?: ChatMention[];
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
  progressPercentage: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
}

export interface AutonomousIteration {
  id: string;
  sessionId: string;
  iterationNumber: number;
  threadId?: string;
  phase: AutonomousIterationPhase;
  evaluation?: ProgressEvaluation;
  plan?: ActionPlan;
  result?: IterationResult;
  startedAt: Date;
  completedAt?: Date;
  duration?: string;
}

export interface AutonomousObservation {
  id: string;
  sessionId: string;
  iterationId?: string;
  type: AutonomousObservationType;
  content: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface CreateAutonomousSessionInput {
  name: string;
  goal: string;
  agentId?: string;
  maxIterations?: number;
  chatModel?: {
    provider: string;
    model: string;
  };
  toolChoice?: string;
  mentions?: ChatMention[];
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
}

export interface UpdateAutonomousSessionInput {
  name?: string;
  goal?: string;
  status?: AutonomousSessionStatus;
  maxIterations?: number;
  currentIteration?: number;
  progressPercentage?: number;
  error?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  goal: string;
  status: AutonomousSessionStatus;
  progressPercentage: number;
  currentIteration: number;
  maxIterations: number;
  agentName?: string;
  createdAt: Date;
  lastActivityAt: Date;
  iterationCount: number;
  observationCount: number;
}

export interface ContinueSessionInput {
  userFeedback?: string;
}
