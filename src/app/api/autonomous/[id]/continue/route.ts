import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { autonomousRepository } from "@/lib/db/repository";
import { AutonomousOrchestrator } from "@/lib/ai/autonomous/orchestrator";
import { z } from "zod";

const continueSessionSchema = z.object({
  userFeedback: z.string().optional(),
});

// Set maximum duration to 5 minutes for autonomous execution
export const maxDuration = 300;

/**
 * POST /api/autonomous/[id]/continue
 * Continue executing an autonomous session
 *
 * This endpoint executes one or more iterations of the autonomous loop:
 * 1. Evaluate progress toward goal
 * 2. Generate action plan
 * 3. Execute action (with full tool access)
 * 4. Observe results
 * 5. Repeat until goal achieved, paused, or max iterations reached
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validationResult = continueSessionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error },
        { status: 400 },
      );
    }

    // Get the session
    const autonomousSession = await autonomousRepository.selectSession(
      params.id,
      session.user.id,
    );

    if (!autonomousSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check if session can be continued
    if (
      autonomousSession.status === "completed" ||
      autonomousSession.status === "failed"
    ) {
      return NextResponse.json(
        { error: "Session is already completed or failed" },
        { status: 400 },
      );
    }

    // If user feedback is provided, record it
    if (validationResult.data.userFeedback) {
      await autonomousRepository.insertObservation({
        sessionId: params.id,
        type: "user_intervention",
        content: validationResult.data.userFeedback,
        metadata: { timestamp: new Date().toISOString() },
      });
    }

    // Create orchestrator and execute
    const orchestrator = new AutonomousOrchestrator(
      autonomousSession,
      session.user.id,
    );

    const result = await orchestrator.execute();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error continuing autonomous session:", error);
    return NextResponse.json(
      {
        error: "Failed to continue session",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
