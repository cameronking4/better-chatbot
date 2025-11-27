import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional().nullable(),
  scopes: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await apiKeyRepository.list(session.user.id);

    // Never expose key hash or full key in list
    const sanitizedKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    return NextResponse.json({ keys: sanitizedKeys });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json(
      { error: "Failed to list API keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { name, expiresAt, scopes } = parsed.data;

    const apiKey = await apiKeyRepository.create(session.user.id, {
      name,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      scopes,
    });

    // Return full key only once at creation
    return NextResponse.json({
      key: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        fullKey: apiKey.fullKey, // Only shown once!
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    if (error instanceof Error && error.message.includes("Maximum number")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 },
    );
  }
}
