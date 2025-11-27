import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

// Schema for creating an API key
const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  rateLimit: z.number().int().positive().optional().default(60),
  expiresAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
  scopes: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional().default({}),
});

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const keys = await apiKeyRepository.listByUser(session.user.id);

    // Remove sensitive fields before sending
    const sanitizedKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount.toString(), // Convert BigInt to string for JSON
      rateLimit: key.rateLimit,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      revokedAt: key.revokedAt,
      scopes: key.scopes,
    }));

    return Response.json(sanitizedKeys);
  } catch (error) {
    console.error("Failed to fetch API keys:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Create a new API key for the authenticated user
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const data = CreateApiKeySchema.parse(body);

    const apiKey = await apiKeyRepository.create({
      userId: session.user.id,
      name: data.name,
      rateLimit: data.rateLimit,
      expiresAt: data.expiresAt,
      scopes: data.scopes,
      metadata: data.metadata,
    });

    // Return the key with plaintext (only time it's shown)
    return Response.json({
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key, // IMPORTANT: Only returned once
      keyPrefix: apiKey.keyPrefix,
      rateLimit: apiKey.rateLimit,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      scopes: apiKey.scopes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to create API key:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
