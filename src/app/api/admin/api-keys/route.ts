import { getSession } from "auth/server";
import { apiKeyRepository } from "@/lib/db/repository";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { ApiKeyTable, UserTable } from "@/lib/db/pg/schema.pg";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await hasAdminPermission();
    if (!isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all API keys with user information
    const results = await db
      .select({
        id: ApiKeyTable.id,
        userId: ApiKeyTable.userId,
        userName: UserTable.name,
        userEmail: UserTable.email,
        name: ApiKeyTable.name,
        keyPrefix: ApiKeyTable.keyPrefix,
        createdAt: ApiKeyTable.createdAt,
        lastUsedAt: ApiKeyTable.lastUsedAt,
        requestCount: ApiKeyTable.requestCount,
        expiresAt: ApiKeyTable.expiresAt,
        rateLimit: ApiKeyTable.rateLimit,
        isActive: ApiKeyTable.isActive,
      })
      .from(ApiKeyTable)
      .leftJoin(UserTable, eq(ApiKeyTable.userId, UserTable.id))
      .orderBy(desc(ApiKeyTable.createdAt));

    const apiKeys = results.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      name: r.name,
      keyPrefix: r.keyPrefix,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      requestCount: r.requestCount,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      rateLimit: r.rateLimit,
      isActive: r.isActive,
    }));

    return Response.json(apiKeys);
  } catch (error: any) {
    console.error("Failed to fetch API keys:", error);
    return Response.json(
      { error: error.message || "Failed to fetch API keys" },
      { status: 500 },
    );
  }
}
