import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { autonomousRepository } from "@/lib/db/repository";

/**
 * GET /api/autonomous/[id]/observations
 * Get all observations for a session
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

    const observations = await autonomousRepository.selectObservations(params.id);

    return NextResponse.json(observations);
  } catch (error) {
    console.error("Error fetching observations:", error);
    return NextResponse.json(
      { error: "Failed to fetch observations" },
      { status: 500 },
    );
  }
}
