import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { hasAdminPermission } from "lib/auth/permissions";
import { z } from "zod";

// Schema for updating an API key
const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  rateLimit: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
  scopes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/api-keys/:id
 * Get a specific API key by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id } = await params;

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const apiKey = await apiKeyRepository.findById(id);

    if (!apiKey) {
      return new Response("API key not found", { status: 404 });
    }

    // Check ownership or admin permission
    const isAdmin = await hasAdminPermission();
    if (apiKey.userId !== session.user.id && !isAdmin) {
      return new Response("Forbidden", { status: 403 });
    }

    // Return sanitized key (no hash, no plaintext)
    return Response.json({
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      usageCount: apiKey.usageCount.toString(),
      rateLimit: apiKey.rateLimit,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
      revokedAt: apiKey.revokedAt,
      scopes: apiKey.scopes,
      metadata: apiKey.metadata,
    });
  } catch (error) {
    console.error("Failed to fetch API key:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * PATCH /api/api-keys/:id
 * Update an API key
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  const { id } = await params;

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const apiKey = await apiKeyRepository.findById(id);

    if (!apiKey) {
      return new Response("API key not found", { status: 404 });
    }

    // Check ownership or admin permission
    const isAdmin = await hasAdminPermission();
    if (apiKey.userId !== session.user.id && !isAdmin) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const data = UpdateApiKeySchema.parse(body);

    const updatedKey = await apiKeyRepository.update(id, data);

    return Response.json({
      id: updatedKey.id,
      name: updatedKey.name,
      keyPrefix: updatedKey.keyPrefix,
      rateLimit: updatedKey.rateLimit,
      expiresAt: updatedKey.expiresAt,
      updatedAt: updatedKey.updatedAt,
      scopes: updatedKey.scopes,
      metadata: updatedKey.metadata,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to update API key:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/api-keys/:id
 * Revoke an API key (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  const { id } = await params;

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const apiKey = await apiKeyRepository.findById(id);

    if (!apiKey) {
      return new Response("API key not found", { status: 404 });
    }

    // Check ownership or admin permission
    const isAdmin = await hasAdminPermission();
    if (apiKey.userId !== session.user.id && !isAdmin) {
      return new Response("Forbidden", { status: 403 });
    }

    await apiKeyRepository.revoke(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke API key:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
