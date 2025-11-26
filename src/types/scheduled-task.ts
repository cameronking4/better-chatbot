import { ChatMention } from "./chat";

export type ScheduleType = "cron" | "interval";

export type IntervalUnit = "minutes" | "hours" | "days" | "weeks";

export interface CronSchedule {
  type: "cron";
  expression: string; // e.g., "0 9 * * *" for 9am daily
}

export interface IntervalSchedule {
  type: "interval";
  value: number; // e.g., 5
  unit: IntervalUnit; // e.g., "minutes"
}

export type ScheduleConfig = CronSchedule | IntervalSchedule;

export interface ScheduledTask {
  id: string;
  userId: string;
  name: string;
  description?: string;
  prompt: string;
  schedule: ScheduleConfig;
  enabled: boolean;
  agentId?: string;
  chatModel?: {
    provider: string;
    model: string;
  };
  toolChoice?: string;
  mentions?: ChatMention[];
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduledTaskExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failed";

export interface ScheduledTaskExecution {
  id: string;
  scheduledTaskId: string;
  threadId?: string;
  status: ScheduledTaskExecutionStatus;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: string; // Duration in milliseconds as string
}

export interface CreateScheduledTaskInput {
  name: string;
  description?: string;
  prompt: string;
  schedule: ScheduleConfig;
  enabled?: boolean;
  agentId?: string;
  chatModel?: {
    provider: string;
    model: string;
  };
  toolChoice?: string;
  mentions?: ChatMention[];
}

export interface UpdateScheduledTaskInput {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: ScheduleConfig;
  enabled?: boolean;
  agentId?: string;
  chatModel?: {
    provider: string;
    model: string;
  };
  toolChoice?: string;
  mentions?: ChatMention[];
}
