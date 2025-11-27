import { pgDb as db } from "../db.pg";
import { ApiKeyTable, UserTable } from "../schema.pg";
import { and, eq, desc } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  getKeyPrefix,
} from "@/lib/api-keys/generator";
import {
  ApiKey,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from "@/types/api-key";

export interface ApiKeyRepository {
  insertApiKey(
    userId: string,
    data: CreateApiKeyRequest,
  ): Promise<{ id: string; key: string }>;
  selectApiKeyById(id: string, userId: string): Promise<ApiKey | null>;
  selectApiKeysByUserId(userId: string): Promise<ApiKey[]>;
  selectApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  updateApiKey(
    id: string,
    userId: string,
    data: UpdateApiKeyRequest,
  ): Promise<ApiKey>;
  deleteApiKey(id: string, userId: string): Promise<void>;
  rotateApiKey(
    id: string,
    userId: string,
  ): Promise<{ id: string; key: string }>;
  incrementRequestCount(id: string): Promise<void>;
  updateLastUsedAt(id: string): Promise<void>;
}

export const pgApiKeyRepository: ApiKeyRepository = {
  async insertApiKey(userId, data) {
    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = getKeyPrefix(key);

    const [result] = await db
      .insert(ApiKeyTable)
      .values({
        id: generateUUID(),
        userId,
        name: data.name,
        keyHash,
        keyPrefix,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        rateLimit: data.rateLimit ?? null,
        isActive: true,
        requestCount: 0,
        createdAt: new Date(),
      })
      .returning();

    return {
      id: result.id,
      key, // Return plaintext key only once
    };
  },

  async selectApiKeyById(id, userId) {
    const [result] = await db
      .select()
      .from(ApiKeyTable)
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));

    if (!result) return null;

    return {
      id: result.id,
      userId: result.userId,
      name: result.name,
      keyPrefix: result.keyPrefix,
      createdAt: result.createdAt.toISOString(),
      lastUsedAt: result.lastUsedAt?.toISOString() ?? null,
      requestCount: result.requestCount,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      rateLimit: result.rateLimit,
      isActive: result.isActive,
    };
  },

  async selectApiKeysByUserId(userId) {
    const results = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.userId, userId))
      .orderBy(desc(ApiKeyTable.createdAt));

    return results.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      keyPrefix: r.keyPrefix,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      requestCount: r.requestCount,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      rateLimit: r.rateLimit,
      isActive: r.isActive,
    }));
  },

  async selectApiKeyByHash(keyHash) {
    const [result] = await db
      .select()
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.keyHash, keyHash));

    if (!result) return null;

    return {
      id: result.id,
      userId: result.userId,
      name: result.name,
      keyPrefix: result.keyPrefix,
      createdAt: result.createdAt.toISOString(),
      lastUsedAt: result.lastUsedAt?.toISOString() ?? null,
      requestCount: result.requestCount,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      rateLimit: result.rateLimit,
      isActive: result.isActive,
    };
  },

  async updateApiKey(id, userId, data) {
    const [result] = await db
      .update(ApiKeyTable)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.expiresAt !== undefined && {
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        }),
        ...(data.rateLimit !== undefined && { rateLimit: data.rateLimit }),
      })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)))
      .returning();

    if (!result) {
      throw new Error("API key not found");
    }

    return {
      id: result.id,
      userId: result.userId,
      name: result.name,
      keyPrefix: result.keyPrefix,
      createdAt: result.createdAt.toISOString(),
      lastUsedAt: result.lastUsedAt?.toISOString() ?? null,
      requestCount: result.requestCount,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      rateLimit: result.rateLimit,
      isActive: result.isActive,
    };
  },

  async deleteApiKey(id, userId) {
    // Soft delete by setting isActive to false
    await db
      .update(ApiKeyTable)
      .set({ isActive: false })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)));
  },

  async rotateApiKey(id, userId) {
    // Generate new key
    const newKey = generateApiKey();
    const newKeyHash = hashApiKey(newKey);
    const newKeyPrefix = getKeyPrefix(newKey);

    // Update the key (invalidate old one, create new)
    const [result] = await db
      .update(ApiKeyTable)
      .set({
        keyHash: newKeyHash,
        keyPrefix: newKeyPrefix,
        requestCount: 0, // Reset request count
        lastUsedAt: null, // Reset last used
      })
      .where(and(eq(ApiKeyTable.id, id), eq(ApiKeyTable.userId, userId)))
      .returning();

    if (!result) {
      throw new Error("API key not found");
    }

    return {
      id: result.id,
      key: newKey, // Return plaintext key only once
    };
  },

  async incrementRequestCount(id) {
    const [current] = await db
      .select({ requestCount: ApiKeyTable.requestCount })
      .from(ApiKeyTable)
      .where(eq(ApiKeyTable.id, id));

    if (current) {
      await db
        .update(ApiKeyTable)
        .set({ requestCount: current.requestCount + 1 })
        .where(eq(ApiKeyTable.id, id));
    }
  },

  async updateLastUsedAt(id) {
    await db
      .update(ApiKeyTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(ApiKeyTable.id, id));
  },
};
