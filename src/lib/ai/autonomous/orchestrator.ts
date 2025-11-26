import { chatRepository, autonomousRepository } from "@/lib/db/repository";
import type {
  AutonomousSession,
  ProgressEvaluation,
  ActionPlan,
  IterationResult,
} from "@/types/autonomous";
import logger from "logger";
import { generateUUID } from "@/lib/utils";

export interface OrchestratorResult {
  success: boolean;
  status: "completed" | "paused" | "failed" | "max_iterations_reached";
  message: string;
  finalProgress: number;
}

/**
 * Autonomous Orchestrator - Manages recursive execution of autonomous sessions
 *
 * Flow:
 * 1. Evaluate progress toward goal
 * 2. Generate action plan
 * 3. Execute action (call chat API)
 * 4. Observe results
 * 5. Repeat until goal achieved or max iterations reached
 */
export class AutonomousOrchestrator {
  private session: AutonomousSession;
  private userId: string;

  constructor(session: AutonomousSession, userId: string) {
    this.session = session;
    this.userId = userId;
  }

  /**
   * Execute one iteration of the autonomous loop
   */
  async executeIteration(): Promise<{
    shouldContinue: boolean;
    evaluation: ProgressEvaluation;
  }> {
    const iterationNumber = this.session.currentIteration + 1;

    logger.info(
      `Starting iteration ${iterationNumber}/${this.session.maxIterations} for session ${this.session.id}`,
    );

    // Create iteration record
    const iteration = await autonomousRepository.insertIteration({
      sessionId: this.session.id,
      iterationNumber,
      phase: "evaluating",
    });

    const startTime = Date.now();

    try {
      // Phase 1: Evaluate progress
      await autonomousRepository.updateIteration(iteration.id, {
        phase: "evaluating",
      });

      const evaluation = await this.evaluateProgress(iteration.id);

      await autonomousRepository.updateIteration(iteration.id, {
        evaluation,
      });

      // Check if goal is achieved
      if (evaluation.goalAchieved) {
        logger.info(`Goal achieved for session ${this.session.id}`);
        await this.completeIteration(iteration.id, startTime, true);
        return { shouldContinue: false, evaluation };
      }

      // Check if should continue
      if (!evaluation.shouldContinue) {
        logger.info(
          `Evaluation determined session ${this.session.id} should not continue`,
        );
        await this.completeIteration(iteration.id, startTime, true);
        return { shouldContinue: false, evaluation };
      }

      // Phase 2: Generate action plan
      await autonomousRepository.updateIteration(iteration.id, {
        phase: "planning",
      });

      const plan = await this.generateActionPlan(iteration.id, evaluation);

      await autonomousRepository.updateIteration(iteration.id, {
        plan,
      });

      // Phase 3: Execute action
      await autonomousRepository.updateIteration(iteration.id, {
        phase: "executing",
      });

      const result = await this.executeAction(iteration.id, plan);

      await autonomousRepository.updateIteration(iteration.id, {
        result,
      });

      // Phase 4: Observe and record
      await autonomousRepository.updateIteration(iteration.id, {
        phase: "observing",
      });

      await this.recordObservation(iteration.id, result);

      // Complete iteration
      await this.completeIteration(iteration.id, startTime, result.success);

      // Update session state
      await autonomousRepository.updateSession(
        this.session.id,
        this.userId,
        {
          currentIteration: iterationNumber,
          progressPercentage: evaluation.progressPercentage,
          status: "executing",
        },
      );

      // Check if requires human input
      if (result.error?.includes("requires_human_input")) {
        logger.info(`Session ${this.session.id} requires human input`);
        return { shouldContinue: false, evaluation };
      }

      return { shouldContinue: true, evaluation };
    } catch (error) {
      logger.error(
        `Error in iteration ${iterationNumber} for session ${this.session.id}:`,
        error,
      );

      // Record error
      await autonomousRepository.insertObservation({
        sessionId: this.session.id,
        iterationId: iteration.id,
        type: "error",
        content: error instanceof Error ? error.message : String(error),
        metadata: { iterationNumber },
      });

      await this.completeIteration(iteration.id, startTime, false);

      throw error;
    }
  }

  /**
   * Execute the full autonomous loop
   */
  async execute(): Promise<OrchestratorResult> {
    try {
      // Update session status
      await autonomousRepository.updateSession(
        this.session.id,
        this.userId,
        {
          status: "executing",
        },
      );

      while (this.session.currentIteration < this.session.maxIterations) {
        const { shouldContinue, evaluation } = await this.executeIteration();

        if (!shouldContinue) {
          if (evaluation.goalAchieved) {
            await autonomousRepository.updateSession(
              this.session.id,
              this.userId,
              {
                status: "completed",
                progressPercentage: 100,
              },
            );

            return {
              success: true,
              status: "completed",
              message: "Goal achieved successfully",
              finalProgress: 100,
            };
          } else {
            await autonomousRepository.updateSession(
              this.session.id,
              this.userId,
              {
                status: "paused",
              },
            );

            return {
              success: true,
              status: "paused",
              message: "Session paused - requires intervention",
              finalProgress: evaluation.progressPercentage,
            };
          }
        }

        // Refresh session state
        const updatedSession = await autonomousRepository.selectSession(
          this.session.id,
          this.userId,
        );
        if (updatedSession) {
          this.session = updatedSession;
        }
      }

      // Max iterations reached
      await autonomousRepository.updateSession(
        this.session.id,
        this.userId,
        {
          status: "completed",
        },
      );

      return {
        success: true,
        status: "max_iterations_reached",
        message: `Reached maximum iterations (${this.session.maxIterations})`,
        finalProgress: this.session.progressPercentage,
      };
    } catch (error) {
      logger.error(`Fatal error in autonomous session ${this.session.id}:`, error);

      await autonomousRepository.updateSession(
        this.session.id,
        this.userId,
        {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      );

      return {
        success: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
        finalProgress: this.session.progressPercentage,
      };
    }
  }

  /**
   * Evaluate progress toward the goal
   */
  private async evaluateProgress(
    iterationId: string,
  ): Promise<ProgressEvaluation> {
    // Get recent observations
    const observations = await autonomousRepository.selectObservations(
      this.session.id,
    );
    const recentObservations = observations.slice(-10); // Last 10 observations

    // Create evaluation prompt
    const evaluationPrompt = `You are evaluating progress toward a goal for an autonomous agent session.

Goal: ${this.session.goal}

Current Progress: ${this.session.progressPercentage}%
Current Iteration: ${this.session.currentIteration}/${this.session.maxIterations}

Recent Observations:
${recentObservations.map((obs) => `- [${obs.type}] ${obs.content}`).join("\n")}

Evaluate the progress and provide:
1. Is the goal achieved? (true/false)
2. Progress percentage (0-100)
3. Any blockers preventing progress
4. Recommendations for next steps
5. Should we continue? (true/false)

Respond in JSON format:
{
  "goalAchieved": boolean,
  "progressPercentage": number,
  "blockers": string[],
  "recommendations": string[],
  "shouldContinue": boolean
}`;

    // Call chat API for evaluation
    const thread = await chatRepository.insertThread({
      id: generateUUID(),
      title: `[Evaluation] ${this.session.name} - Iteration ${this.session.currentIteration + 1}`,
      userId: this.userId,
    });

    const messageId = generateUUID();
    const userMessage = {
      id: messageId,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: evaluationPrompt,
        },
      ],
    };

    await chatRepository.upsertMessage({
      threadId: thread.id,
      id: userMessage.id,
      role: userMessage.role,
      parts: userMessage.parts,
    });

    const chatApiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;

    const response = await fetch(`${chatApiUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        id: thread.id,
        message: userMessage,
        chatModel: this.session.chatModel || {
          provider: "openai",
          model: "gpt-4o",
        },
        toolChoice: "none",
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.statusText}`);
    }

    // Consume the stream and extract JSON response
    const reader = response.body?.getReader();
    let fullResponse = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += new TextDecoder().decode(value);
      }
    }

    // Parse JSON from response (extract from markdown code blocks if needed)
    let evaluation: ProgressEvaluation;
    try {
      const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/) ||
                       fullResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : fullResponse;
      evaluation = JSON.parse(jsonStr);
    } catch (error) {
      // Fallback if JSON parsing fails
      logger.warn("Failed to parse evaluation JSON, using default");
      evaluation = {
        goalAchieved: false,
        progressPercentage: this.session.progressPercentage,
        blockers: ["Failed to parse evaluation"],
        recommendations: ["Retry evaluation"],
        shouldContinue: true,
      };
    }

    // Record evaluation observation
    await autonomousRepository.insertObservation({
      sessionId: this.session.id,
      iterationId,
      type: "evaluation",
      content: `Progress: ${evaluation.progressPercentage}%, Goal achieved: ${evaluation.goalAchieved}`,
      metadata: { evaluation },
    });

    // Update iteration with thread ID
    await autonomousRepository.updateIteration(iterationId, {
      phase: "evaluating",
    });

    return evaluation;
  }

  /**
   * Generate an action plan based on evaluation
   */
  private async generateActionPlan(
    iterationId: string,
    evaluation: ProgressEvaluation,
  ): Promise<ActionPlan> {
    const planningPrompt = `You are planning the next action for an autonomous agent session.

Goal: ${this.session.goal}

Current Progress: ${evaluation.progressPercentage}%
Blockers: ${evaluation.blockers?.join(", ") || "None"}
Recommendations: ${evaluation.recommendations?.join(", ") || "None"}

Generate a specific, actionable plan for the next step. Provide:
1. The action to take
2. Rationale for this action
3. Expected outcome

Respond in JSON format:
{
  "action": "specific action description",
  "rationale": "why this action",
  "expectedOutcome": "what we expect to achieve"
}`;

    // Call chat API for planning
    const thread = await chatRepository.insertThread({
      id: generateUUID(),
      title: `[Planning] ${this.session.name} - Iteration ${this.session.currentIteration + 1}`,
      userId: this.userId,
    });

    const messageId = generateUUID();
    const userMessage = {
      id: messageId,
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: planningPrompt,
        },
      ],
    };

    await chatRepository.upsertMessage({
      threadId: thread.id,
      id: userMessage.id,
      role: userMessage.role,
      parts: userMessage.parts,
    });

    const chatApiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;

    const response = await fetch(`${chatApiUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        id: thread.id,
        message: userMessage,
        chatModel: this.session.chatModel || {
          provider: "openai",
          model: "gpt-4o",
        },
        toolChoice: "none",
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.statusText}`);
    }

    // Consume the stream
    const reader = response.body?.getReader();
    let fullResponse = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += new TextDecoder().decode(value);
      }
    }

    // Parse JSON from response
    let plan: ActionPlan;
    try {
      const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/) ||
                       fullResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : fullResponse;
      plan = JSON.parse(jsonStr);
    } catch (error) {
      logger.warn("Failed to parse plan JSON, using default");
      plan = {
        action: "Continue working toward goal",
        rationale: "Making incremental progress",
        expectedOutcome: "Move closer to goal completion",
      };
    }

    // Record planning observation
    await autonomousRepository.insertObservation({
      sessionId: this.session.id,
      iterationId,
      type: "planning",
      content: `Action: ${plan.action}`,
      metadata: { plan },
    });

    return plan;
  }

  /**
   * Execute the planned action
   */
  private async executeAction(
    iterationId: string,
    plan: ActionPlan,
  ): Promise<IterationResult> {
    try {
      // Create execution prompt
      const executionPrompt = `Execute the following action toward achieving this goal:

Goal: ${this.session.goal}

Planned Action: ${plan.action}
Rationale: ${plan.rationale}
Expected Outcome: ${plan.expectedOutcome}

Execute this action and report back on what you accomplished.`;

      // Create thread for execution
      const thread = await chatRepository.insertThread({
        id: generateUUID(),
        title: `[Execute] ${this.session.name} - Iteration ${this.session.currentIteration + 1}`,
        userId: this.userId,
      });

      const messageId = generateUUID();
      const userMessage = {
        id: messageId,
        role: "user" as const,
        parts: [
          {
            type: "text" as const,
            text: executionPrompt,
          },
        ],
      };

      await chatRepository.upsertMessage({
        threadId: thread.id,
        id: userMessage.id,
        role: userMessage.role,
        parts: userMessage.parts,
      });

      // Call chat API with full tool access
      const chatApiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const apiKey =
        process.env.NEXT_PUBLIC_API_KEY ?? process.env.CHAT_API_KEY;

      const response = await fetch(`${chatApiUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          id: thread.id,
          message: userMessage,
          chatModel: this.session.chatModel || {
            provider: "openai",
            model: "gpt-4o",
          },
          toolChoice: this.session.toolChoice || "auto",
          mentions: this.session.mentions || [],
          allowedAppDefaultToolkit:
            this.session.allowedAppDefaultToolkit ?? undefined,
          allowedMcpServers: this.session.allowedMcpServers ?? undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Chat API error: ${response.statusText} - ${errorText}`,
        };
      }

      // Consume the stream
      const reader = response.body?.getReader();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullResponse += new TextDecoder().decode(value);
        }
      }

      // Update iteration with thread ID
      await autonomousRepository.updateIteration(iterationId, {
        phase: "executing",
      });

      return {
        success: true,
        output: fullResponse,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Record observation from execution result
   */
  private async recordObservation(
    iterationId: string,
    result: IterationResult,
  ): Promise<void> {
    const content = result.success
      ? `Execution successful: ${result.output ? String(result.output).substring(0, 500) : "completed"}`
      : `Execution failed: ${result.error}`;

    await autonomousRepository.insertObservation({
      sessionId: this.session.id,
      iterationId,
      type: "execution",
      content,
      metadata: { success: result.success },
    });
  }

  /**
   * Complete an iteration and record duration
   */
  private async completeIteration(
    iterationId: string,
    startTime: number,
    success: boolean,
  ): Promise<void> {
    const duration = Date.now() - startTime;

    await autonomousRepository.updateIteration(iterationId, {
      completedAt: new Date(),
      duration: duration.toString(),
      result: {
        success,
      },
    });
  }
}
