import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { autonomousRepository } from "@/lib/db/repository";
import type { CreateAutonomousSessionInput } from "@/types/autonomous";
import { z } from "zod";

// Schema for creating autonomous sessions
const createSessionSchema = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().min(1),
  agentId: z.string().uuid().optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.string().optional(),
  mentions: z.array(z.any()).optional(),
  allowedMcpServers: z.record(z.any()).optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
});

/**
 * GET /api/autonomous
 * List all autonomous sessions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    let sessions;
    if (status) {
      const statuses = status.split(",") as any[];
      sessions = await autonomousRepository.selectSessionsByStatus(
        session.user.id,
        statuses,
      );
    } else {
      sessions = await autonomousRepository.selectSessions(session.user.id);
    }

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error listing autonomous sessions:", error);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/autonomous
 * Create a new autonomous session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validationResult = createSessionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error },
        { status: 400 },
      );
    }

    const input: CreateAutonomousSessionInput = validationResult.data;

    // Create session
    const newSession = await autonomousRepository.insertSession(
      session.user.id,
      input,
    );

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    console.error("Error creating autonomous session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
