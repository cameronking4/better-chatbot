import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { hasAdminPermission } from "lib/auth/permissions";

/**
 * POST /api/api-keys/:id/rotate
 * Rotate an API key (revoke old, create new)
 */
export async function POST(
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

    const newKey = await apiKeyRepository.rotate(id, session.user.id);

    if (!newKey) {
      return new Response("Failed to rotate API key", { status: 500 });
    }

    // Return the new key with plaintext (only time it's shown)
    return Response.json({
      id: newKey.id,
      name: newKey.name,
      key: newKey.key, // IMPORTANT: Only returned once
      keyPrefix: newKey.keyPrefix,
      rateLimit: newKey.rateLimit,
      expiresAt: newKey.expiresAt,
      createdAt: newKey.createdAt,
      scopes: newKey.scopes,
    });
  } catch (error) {
    console.error("Failed to rotate API key:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
