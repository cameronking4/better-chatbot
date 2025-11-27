import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskOrchestrator } from "./task-orchestrator";
import { TaskExecutionEntity } from "lib/db/pg/schema.pg";

// Mock dependencies
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModel: vi.fn(() => ({})),
  },
}));

vi.mock("lib/db/repository", () => ({
  taskExecutionRepository: {
    saveCheckpoint: vi.fn(),
    addTrace: vi.fn(),
    getLatestCheckpoint: vi.fn(),
    getTaskExecution: vi.fn(),
    updateTaskExecution: vi.fn(),
  },
}));

vi.mock("logger", () => ({
  default: {
    withDefaults: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe("TaskOrchestrator", () => {
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    orchestrator = new TaskOrchestrator({
      chatModel: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
      },
    });
  });

  describe("evaluateProgress", () => {
    it("should return shouldContinue=false when all steps completed", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "5",
        strategy: {
          steps: [
            { id: "1", description: "Step 1", type: "tool-call", status: "completed" },
            { id: "2", description: "Step 2", type: "tool-call", status: "completed" },
          ],
          totalSteps: 2,
        },
        status: "running",
        retryCount: "0",
      };

      const result = await orchestrator.evaluateProgress(task as TaskExecutionEntity);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe("All steps completed");
    });

    it("should return shouldContinue=false when task failed", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: {
          steps: [{ id: "1", description: "Step 1", type: "tool-call", status: "pending" }],
          totalSteps: 1,
        },
        status: "failed",
        retryCount: "0",
      };

      const result = await orchestrator.evaluateProgress(task as TaskExecutionEntity);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe("Task failed");
    });

    it("should return shouldContinue=false when retry count exceeded", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: {
          steps: [{ id: "1", description: "Step 1", type: "tool-call", status: "pending" }],
          totalSteps: 1,
        },
        status: "running",
        retryCount: "6",
      };

      const result = await orchestrator.evaluateProgress(task as TaskExecutionEntity);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe("Maximum retry count exceeded");
    });

    it("should return shouldContinue=true when more steps to execute", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: {
          steps: [
            { id: "1", description: "Step 1", type: "tool-call", status: "pending" },
            { id: "2", description: "Step 2", type: "tool-call", status: "pending" },
          ],
          totalSteps: 2,
        },
        status: "running",
        retryCount: "0",
      };

      const result = await orchestrator.evaluateProgress(task as TaskExecutionEntity);

      expect(result.shouldContinue).toBe(true);
      expect(result.reason).toBe("More steps to execute");
    });
  });

  describe("selectNextAction", () => {
    it("should return next pending step", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: {
          steps: [
            { id: "step-1", description: "First step", type: "tool-call", status: "pending" },
            { id: "step-2", description: "Second step", type: "llm-reasoning", status: "pending" },
          ],
          totalSteps: 2,
        },
      };

      const result = await orchestrator.selectNextAction(task as TaskExecutionEntity);

      expect(result).toEqual({
        action: "tool-call",
        stepId: "step-1",
        description: "First step",
      });
    });

    it("should return null when no strategy", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: undefined,
      };

      const result = await orchestrator.selectNextAction(task as TaskExecutionEntity);

      expect(result).toBeNull();
    });

    it("should return null when current step exceeds total steps", async () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "5",
        strategy: {
          steps: [
            { id: "step-1", description: "First step", type: "tool-call", status: "completed" },
          ],
          totalSteps: 1,
        },
      };

      const result = await orchestrator.selectNextAction(task as TaskExecutionEntity);

      expect(result).toBeNull();
    });
  });

  describe("shouldSummarizeContext", () => {
    it("should return true when approaching context window limit", () => {
      const result = orchestrator.shouldSummarizeContext(85000, 0.8);
      expect(result).toBe(true);
    });

    it("should return false when well below context window limit", () => {
      const result = orchestrator.shouldSummarizeContext(50000, 0.8);
      expect(result).toBe(false);
    });

    it("should respect custom threshold", () => {
      const result = orchestrator.shouldSummarizeContext(95000, 0.9);
      expect(result).toBe(true);
    });
  });

  describe("estimateCompletionTime", () => {
    it("should estimate completion time based on remaining steps", () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "1",
        strategy: {
          steps: [
            { id: "1", description: "Step 1", type: "tool-call", status: "completed", estimatedDuration: 10000 },
            { id: "2", description: "Step 2", type: "tool-call", status: "pending", estimatedDuration: 20000 },
            { id: "3", description: "Step 3", type: "llm-reasoning", status: "pending", estimatedDuration: 15000 },
          ],
          totalSteps: 3,
        },
      };

      const result = orchestrator.estimateCompletionTime(task as TaskExecutionEntity);

      expect(result).toBeInstanceOf(Date);
      // Should estimate remaining time for steps 2 and 3 (35000ms)
      const expectedTime = Date.now() + 35000;
      expect(result!.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);
      expect(result!.getTime()).toBeLessThanOrEqual(expectedTime + 1000);
    });

    it("should return null when no strategy", () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: undefined,
      };

      const result = orchestrator.estimateCompletionTime(task as TaskExecutionEntity);

      expect(result).toBeNull();
    });

    it("should use default duration when not specified", () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-id",
        currentStep: "0",
        strategy: {
          steps: [
            { id: "1", description: "Step 1", type: "tool-call", status: "pending" },
            { id: "2", description: "Step 2", type: "tool-call", status: "pending" },
          ],
          totalSteps: 2,
        },
      };

      const result = orchestrator.estimateCompletionTime(task as TaskExecutionEntity);

      expect(result).toBeInstanceOf(Date);
      // Should use default 30000ms per step for 2 steps (60000ms)
      const expectedTime = Date.now() + 60000;
      expect(result!.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);
      expect(result!.getTime()).toBeLessThanOrEqual(expectedTime + 1000);
    });
  });

  describe("getTaskSummary", () => {
    it("should generate human-readable summary", () => {
      const task: Partial<TaskExecutionEntity> = {
        id: "test-task-123",
        currentStep: "2",
        status: "running",
        strategy: {
          steps: [
            { id: "1", description: "Step 1", type: "tool-call", status: "completed" },
            { id: "2", description: "Step 2", type: "tool-call", status: "completed" },
            { id: "3", description: "Step 3 in progress", type: "llm-reasoning", status: "running" },
            { id: "4", description: "Step 4", type: "tool-call", status: "pending" },
          ],
          totalSteps: 4,
        },
      };

      const result = orchestrator.getTaskSummary(task as TaskExecutionEntity);

      expect(result).toContain("test-task-123");
      expect(result).toContain("running");
      expect(result).toContain("50%"); // 2/4 steps completed
      expect(result).toContain("step 3/4");
      expect(result).toContain("Step 3 in progress");
    });
  });

  describe("handleToolFailure", () => {
    it("should retry on first few attempts", async () => {
      const { taskExecutionRepository } = await import("lib/db/repository");
      vi.mocked(taskExecutionRepository.getTaskExecution).mockResolvedValue({
        id: "test-id",
        retryCount: "0",
      } as any);

      const result = await orchestrator.handleToolFailure(
        "test-id",
        "testTool",
        new Error("Tool failed"),
        1
      );

      expect(result.shouldRetry).toBe(true);
      expect(result.delay).toBe(2000); // 2^1 * 1000
      expect(result.reason).toContain("retrying with backoff");
    });

    it("should not retry after max attempts", async () => {
      const { taskExecutionRepository } = await import("lib/db/repository");
      vi.mocked(taskExecutionRepository.getTaskExecution).mockResolvedValue({
        id: "test-id",
        retryCount: "2",
      } as any);
      vi.mocked(taskExecutionRepository.updateTaskExecution).mockResolvedValue({} as any);

      const result = await orchestrator.handleToolFailure(
        "test-id",
        "testTool",
        new Error("Tool failed"),
        3
      );

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain("Max retries exceeded");
      expect(taskExecutionRepository.updateTaskExecution).toHaveBeenCalledWith("test-id", {
        retryCount: "3",
      });
    });

    it("should return false when task not found", async () => {
      const { taskExecutionRepository } = await import("lib/db/repository");
      vi.mocked(taskExecutionRepository.getTaskExecution).mockResolvedValue(null);

      const result = await orchestrator.handleToolFailure(
        "nonexistent-id",
        "testTool",
        new Error("Tool failed"),
        1
      );

      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toBe("Task not found");
    });
  });
});
