import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { autonomousRepository } from "@/lib/db/repository";
import type { UpdateAutonomousSessionInput } from "@/types/autonomous";
import { z } from "zod";

const updateSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  goal: z.string().min(1).optional(),
  status: z
    .enum(["planning", "executing", "paused", "completed", "failed"])
    .optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  currentIteration: z.number().int().min(0).optional(),
  progressPercentage: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
});

/**
 * GET /api/autonomous/[id]
 * Get a specific autonomous session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const autonomousSession = await autonomousRepository.selectSession(
      params.id,
      session.user.id,
    );

    if (!autonomousSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(autonomousSession);
  } catch (error) {
    console.error("Error fetching autonomous session:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/autonomous/[id]
 * Update an autonomous session
 */
export async function PATCH(
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
    const validationResult = updateSessionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error },
        { status: 400 },
      );
    }

    const input: UpdateAutonomousSessionInput = validationResult.data;

    // Update session
    const updatedSession = await autonomousRepository.updateSession(
      params.id,
      session.user.id,
      input,
    );

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Error updating autonomous session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/autonomous/[id]
 * Delete an autonomous session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await autonomousRepository.deleteSession(params.id, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting autonomous session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 },
    );
  }
}
