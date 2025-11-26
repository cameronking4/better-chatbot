import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { autonomousRepository } from "@/lib/db/repository";

/**
 * GET /api/autonomous/[id]/iterations
 * Get all iterations for a session
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

    // Verify session ownership
    const autonomousSession = await autonomousRepository.selectSession(
      params.id,
      session.user.id,
    );

    if (!autonomousSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const iterations = await autonomousRepository.selectIterations(params.id);

    return NextResponse.json(iterations);
  } catch (error) {
    console.error("Error fetching iterations:", error);
    return NextResponse.json(
      { error: "Failed to fetch iterations" },
      { status: 500 },
    );
  }
}
