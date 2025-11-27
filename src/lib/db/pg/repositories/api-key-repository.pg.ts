import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { ApiKeyTable, UserTable } from "../schema.pg";
import type {
  ApiKey,
  ApiKeyWithPlaintext,
  CreateApiKeyInput,
  UpdateApiKeyInput,
  ApiKeyValidationResult,
} from "@/lib/api-keys/types";
import { generateApiKey } from "@/lib/api-keys/generator";
import { validateApiKey } from "@/lib/api-keys/validator";

/**
 * Convert database entity to API key domain model
 */
function toApiKey(entity: typeof ApiKeyTable.$inferSelect): ApiKey {
  return {
    ...entity,
    usageCount: BigInt(entity.usageCount),
    rateLimit: Number.parseInt(entity.rateLimit),
    scopes: entity.scopes || [],
    metadata: entity.metadata || {},
  };
}

export const apiKeyRepository = {
  /**
   * Create a new API key for a user
   */
  async create(input: CreateApiKeyInput): Promise<ApiKeyWithPlaintext> {
    const { key, keyHash, keyPrefix } = await generateApiKey();

    const [entity] = await db
      .insert(ApiKeyTable)
      .values({
        userId: input.userId,
        name: input.name,
        keyHash,
        keyPrefix,
        rateLimit: (input.rateLimit || 60).toString(),
        expiresAt: input.expiresAt || null,
        scopes: input.scopes || [],
        metadata: input.metadata || {},
      })
      .returning();

    return {
      ...toApiKey(entity),
      key, // Include plaintext key (only shown once)
    };
  },

  /**
   * Find API key by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    const [entity] = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.id, id));

    return entity ? toApiKey(entity) : null;
  },

  /**
   * Find API key by key hash
   */
  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const [entity] = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.keyHash, keyHash));

    return entity ? toApiKey(entity) : null;
  },

  /**
   * Validate an API key and return user ID if valid
   * This is the main authentication method
   */
  async validateKey(key: string): Promise<ApiKeyValidationResult> {
    // First, try to hash and find the key
    // Note: We can't pre-hash because bcrypt produces different hashes each time
    // So we need to fetch by userId or iterate (for now, we'll use a different approach)

    // Alternative: Fetch all active keys and compare (not scalable, but works for small datasets)
    // Better approach: Add a key_prefix index and filter by prefix first

    // For now, we'll use a simpler approach: fetch by hash directly isn't possible
    // So we need to check against database hash
    // This is a limitation of bcrypt - we need the hash from DB first

    // Better implementation: The calling code should extract user context differently
    // For this implementation, we'll fetch candidate keys and compare

    throw new Error(
      "Direct key validation not supported. Use validateKeyForUser or authenticate via middleware.",
    );
  },

  /**
   * Authenticate an API key (used by middleware)
   * Returns userId if valid, null otherwise
   */
  async authenticate(key: string): Promise<string | null> {
    // Extract prefix from key for faster lookup
    const keyPrefix = `${key.substring(0, 12)}****`;

    // Find all keys with matching prefix (should be very few)
    const candidates = await db
      .select()
      .from(ApiKeyTable)
      .where(
        and(
          eq(ApiKeyTable.keyPrefix, keyPrefix),
          isNull(ApiKeyTable.revokedAt),
        ),
      );

    // Try each candidate (bcrypt comparison)
    for (const candidate of candidates) {
      const result = await validateApiKey(key, candidate.keyHash, {
        userId: candidate.userId,
        expiresAt: candidate.expiresAt,
        revokedAt: candidate.revokedAt,
        lastUsedAt: candidate.lastUsedAt,
        usageCount: candidate.usageCount,
        rateLimit: candidate.rateLimit,
      });

      if (result.valid) {
        // Update usage stats asynchronously (don't block auth)
        this.updateUsage(candidate.id).catch(console.error);
        return candidate.userId;
      }
    }

    return null; // No valid key found
  },

  /**
   * List all API keys for a user
   */
  async listByUser(userId: string): Promise<ApiKey[]> {
    const entities = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.userId, userId))
      .orderBy(desc(ApiKeyTable.createdAt));

    return entities.map(toApiKey);
  },

  /**
   * List all API keys (admin only)
   */
  async listAll(): Promise<
    Array<ApiKey & { userName: string; userEmail: string }>
  > {
    const results = await db
      .select({
        apiKey: ApiKeyTable,
        userName: UserTable.name,
        userEmail: UserTable.email,
      })
      .from(ApiKeyTable)
      .leftJoin(UserTable, eq(ApiKeyTable.userId, UserTable.id))
      .orderBy(desc(ApiKeyTable.createdAt));

    return results.map((r) => ({
      ...toApiKey(r.apiKey),
      userName: r.userName || "Unknown",
      userEmail: r.userEmail || "Unknown",
    }));
  },

  /**
   * Update an API key
   */
  async update(id: string, input: UpdateApiKeyInput): Promise<ApiKey> {
    const [entity] = await db
      .update(ApiKeyTable)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.rateLimit !== undefined && {
          rateLimit: input.rateLimit.toString(),
        }),
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        ...(input.scopes !== undefined && { scopes: input.scopes }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
        updatedAt: new Date(),
      })
      .where(eq(ApiKeyTable.id, id))
      .returning();

    return toApiKey(entity);
  },

  /**
   * Revoke an API key (soft delete)
   */
  async revoke(id: string): Promise<ApiKey> {
    const [entity] = await db
      .update(ApiKeyTable)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ApiKeyTable.id, id))
      .returning();

    return toApiKey(entity);
  },

  /**
   * Delete an API key permanently (hard delete)
   */
  async delete(id: string): Promise<void> {
    await db.delete(ApiKeyTable).where(eq(ApiKeyTable.id, id));
  },

  /**
   * Update usage statistics (called after successful authentication)
   */
  async updateUsage(id: string): Promise<void> {
    await db
      .update(ApiKeyTable)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`CAST(${ApiKeyTable.usageCount} AS INTEGER) + 1`,
        updatedAt: new Date(),
      })
      .where(eq(ApiKeyTable.id, id));
  },

  /**
   * Rotate an API key (revoke old, create new)
   */
  async rotate(
    id: string,
    userId: string,
  ): Promise<ApiKeyWithPlaintext | null> {
    // Get existing key
    const existingKey = await this.findById(id);
    if (!existingKey || existingKey.userId !== userId) {
      return null;
    }

    // Revoke old key
    await this.revoke(id);

    // Create new key with same name
    const newKey = await this.create({
      userId,
      name: `${existingKey.name} (Rotated)`,
      rateLimit: existingKey.rateLimit,
      expiresAt: existingKey.expiresAt,
      scopes: existingKey.scopes,
      metadata: existingKey.metadata,
    });

    return newKey;
  },

  /**
   * Check if a user owns an API key
   */
  async isOwner(keyId: string, userId: string): Promise<boolean> {
    const [result] = await db
      .select({ userId: ApiKeyTable.userId })
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.id, keyId));

    return result?.userId === userId;
  },

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(userId: string): Promise<{
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    totalUsage: bigint;
  }> {
    const [stats] = await db
      .select({
        totalKeys: sql<number>`COUNT(*)::int`,
        activeKeys:
          sql<number>`COUNT(CASE WHEN ${ApiKeyTable.revokedAt} IS NULL AND (${ApiKeyTable.expiresAt} IS NULL OR ${ApiKeyTable.expiresAt} > NOW()) THEN 1 END)::int`,
        revokedKeys:
          sql<number>`COUNT(CASE WHEN ${ApiKeyTable.revokedAt} IS NOT NULL THEN 1 END)::int`,
        totalUsage:
          sql<string>`COALESCE(SUM(CAST(${ApiKeyTable.usageCount} AS BIGINT)), 0)`,
      })
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.userId, userId));

    return {
      totalKeys: stats.totalKeys,
      activeKeys: stats.activeKeys,
      revokedKeys: stats.revokedKeys,
      totalUsage: BigInt(stats.totalUsage),
    };
  },

  /**
   * Cleanup expired keys (run periodically)
   */
  async cleanupExpired(): Promise<number> {
    const result = await db
      .delete(ApiKeyTable)
      .where(
        and(
          sql`${ApiKeyTable.expiresAt} < NOW()`,
          sql`${ApiKeyTable.revokedAt} IS NOT NULL`,
        ),
      );

    return result.rowCount || 0;
  },
};

export type ApiKeyRepository = typeof apiKeyRepository;
