import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { hasAdminPermission } from "lib/auth/permissions";

/**
 * GET /api/admin/api-keys
 * List all API keys across all users (admin only)
 */
export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check admin permission
  const isAdmin = await hasAdminPermission();
  if (!isAdmin) {
    return new Response("Forbidden - Admin access required", { status: 403 });
  }

  try {
    const keys = await apiKeyRepository.listAll();

    // Sanitize keys for admin view
    const sanitizedKeys = keys.map((key) => ({
      id: key.id,
      userId: key.userId,
      userName: key.userName,
      userEmail: key.userEmail,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount.toString(),
      rateLimit: key.rateLimit,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      revokedAt: key.revokedAt,
      scopes: key.scopes,
    }));

    return Response.json(sanitizedKeys);
  } catch (error) {
    console.error("Failed to fetch all API keys:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
