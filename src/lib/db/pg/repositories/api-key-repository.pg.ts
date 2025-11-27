import {
  ApiKey,
  ApiKeyRepository,
  ApiKeyWithFullKey,
  CreateApiKeyInput,
  UpdateApiKeyInput,
  MAX_ACTIVE_KEYS_PER_USER,
  DEFAULT_SCOPES,
} from "app-types/api-key";
import { pgDb as db } from "../db.pg";
import { ApiKeyTable } from "../schema.pg";
import { eq, and, isNull, count } from "drizzle-orm";
import { hash, verify } from "bcrypt-ts";
import { nanoid } from "nanoid";

const BCRYPT_ROUNDS = 10;

/**
 * Generate a new API key with format: bcb_live_<random_32_chars>
 * (bcb = Better ChatBot)
 */
function generateApiKey(): { fullKey: string; prefix: string } {
  const randomPart = nanoid(32);
  const fullKey = `bcb_live_${randomPart}`;
  const prefix = fullKey.substring(0, 16); // "bcb_live_" + first 7 chars
  return { fullKey, prefix };
}

export const pgApiKeyRepository: ApiKeyRepository = {
  create: async (
    userId: string,
    input: CreateApiKeyInput,
  ): Promise<ApiKeyWithFullKey> => {
    // Check active key limit
    const activeCount = await pgApiKeyRepository.countActiveKeys(userId);
    if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new Error(
        `Maximum number of active API keys (${MAX_ACTIVE_KEYS_PER_USER}) reached`,
      );
    }

    const { fullKey, prefix } = generateApiKey();
    const keyHash = await hash(fullKey, BCRYPT_ROUNDS);

    const [result] = await db
      .insert(ApiKeyTable)
      .values({
        userId,
        name: input.name,
        keyPrefix: prefix,
        keyHash,
        scopes: input.scopes ?? DEFAULT_SCOPES,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    return {
      ...result,
      fullKey, // Only returned at creation
    };
  },

  list: async (userId: string): Promise<ApiKey[]> => {
    const results = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.userId, userId))
      .orderBy(ApiKeyTable.createdAt);

    return results;
  },

  getById: async (id: string, userId: string): Promise<ApiKey | null> => {
    const [result] = await db
      .select()
      .from(ApiKeyTable)
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));

    return result || null;
  },

  getByPrefix: async (prefix: string): Promise<ApiKey | null> => {
    const [result] = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.keyPrefix, prefix));

    return result || null;
  },

  update: async (
    id: string,
    userId: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKey> => {
    const [result] = await db
      .update(ApiKeyTable)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        updatedAt: new Date(),
      })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)))
      .returning();

    if (!result) {
      throw new Error("API key not found");
    }

    return result;
  },

  revoke: async (id: string, userId: string): Promise<void> => {
    await db
      .update(ApiKeyTable)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));
  },

  verify: async (
    key: string,
  ): Promise<{ valid: boolean; userId?: string }> => {
    // Extract prefix from the key
    const prefix = key.substring(0, 16);

    // Look up by prefix
    const apiKey = await pgApiKeyRepository.getByPrefix(prefix);

    if (!apiKey) {
      return { valid: false };
    }

    // Check if revoked
    if (apiKey.revokedAt) {
      return { valid: false };
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false };
    }

    // Verify hash
    const isValid = await verify(key, apiKey.keyHash);

    if (!isValid) {
      return { valid: false };
    }

    // Update last used timestamp asynchronously (don't await)
    pgApiKeyRepository.updateLastUsed(apiKey.id).catch((err) => {
      console.error("Failed to update API key last used timestamp:", err);
    });

    return { valid: true, userId: apiKey.userId };
  },

  updateLastUsed: async (id: string): Promise<void> => {
    await db
      .update(ApiKeyTable)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(ApiKeyTable.id, id));
  },

  countActiveKeys: async (userId: string): Promise<number> => {
    const [result] = await db
      .select({ count: count() })
      .from(ApiKeyTable)
      .where(
        and(
          eq(ApiKeyTable.userId, userId),
          isNull(ApiKeyTable.revokedAt),
          // Also exclude expired keys
        ),
      );

    return result?.count ?? 0;
  },
};
