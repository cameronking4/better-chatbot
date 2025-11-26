import cronParser from "cron-parser";
import type { ScheduleConfig } from "@/types/scheduled-task";

/**
 * Calculate the next run time for a scheduled task
 */
export function calculateNextRun(schedule: ScheduleConfig): Date | null {
  try {
    if (schedule.type === "cron") {
      const interval = cronParser.parseExpression(schedule.expression);
      return interval.next().toDate();
    } else if (schedule.type === "interval") {
      const now = new Date();
      const { value, unit } = schedule;

      switch (unit) {
        case "minutes":
          return new Date(now.getTime() + value * 60 * 1000);
        case "hours":
          return new Date(now.getTime() + value * 60 * 60 * 1000);
        case "days":
          return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
        case "weeks":
          return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
        default:
          throw new Error(`Unknown interval unit: ${unit}`);
      }
    }
  } catch (error) {
    console.error("Error calculating next run:", error);
    return null;
  }

  return null;
}

/**
 * Convert schedule config to cron expression for BullMQ
 */
export function scheduleToCron(schedule: ScheduleConfig): string | null {
  if (schedule.type === "cron") {
    return schedule.expression;
  } else if (schedule.type === "interval") {
    const { value, unit } = schedule;

    // Convert interval to cron expression
    switch (unit) {
      case "minutes":
        if (value === 1) return "* * * * *"; // Every minute
        if (value <= 59) return `*/${value} * * * *`; // Every N minutes
        break;
      case "hours":
        if (value === 1) return "0 * * * *"; // Every hour
        if (value <= 23) return `0 */${value} * * *`; // Every N hours
        break;
      case "days":
        if (value === 1) return "0 0 * * *"; // Every day at midnight
        break;
      case "weeks":
        if (value === 1) return "0 0 * * 0"; // Every Sunday at midnight
        break;
    }

    // For complex intervals, return null (will use manual scheduling)
    return null;
  }

  return null;
}

/**
 * Get human-readable description of schedule
 */
export function getScheduleDescription(schedule: ScheduleConfig): string {
  if (schedule.type === "cron") {
    try {
      const interval = cronParser.parseExpression(schedule.expression);
      const next = interval.next().toDate();
      return `Cron: ${schedule.expression} (next: ${next.toLocaleString()})`;
    } catch {
      return `Cron: ${schedule.expression}`;
    }
  } else if (schedule.type === "interval") {
    const { value, unit } = schedule;
    const unitLabel = value === 1 ? unit.slice(0, -1) : unit;
    return `Every ${value} ${unitLabel}`;
  }

  return "Unknown schedule";
}

/**
 * Validate cron expression
 */
export function isValidCron(expression: string): boolean {
  try {
    cronParser.parseExpression(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get delay in milliseconds for interval schedule
 */
export function getIntervalDelay(schedule: ScheduleConfig): number | null {
  if (schedule.type !== "interval") return null;

  const { value, unit } = schedule;

  switch (unit) {
    case "minutes":
      return value * 60 * 1000;
    case "hours":
      return value * 60 * 60 * 1000;
    case "days":
      return value * 24 * 60 * 60 * 1000;
    case "weeks":
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}
