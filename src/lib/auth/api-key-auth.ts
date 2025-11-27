import "server-only";
import { Request } from "next/server";
import { apiKeyRepository } from "@/lib/db/repository";
import { hashApiKey } from "@/lib/api-keys/generator";
import { validateApiKey, isKeyActive } from "@/lib/api-keys/validator";
import { checkRateLimit } from "@/lib/api-keys/rate-limiter";
import { ApiKey } from "@/types/api-key";

export interface ApiKeyAuthResult {
  userId: string;
  apiKey: ApiKey;
}

/**
 * Validates API key from Authorization header
 * Returns userId and apiKey if valid, null otherwise
 */
export async function validateApiKeyFromHeader(
  request: Request,
): Promise<ApiKeyAuthResult | null> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const providedKey = authHeader.substring(7); // Remove "Bearer " prefix

  if (!providedKey || providedKey.trim().length === 0) {
    return null;
  }

  // Hash the provided key to look it up
  const keyHash = hashApiKey(providedKey);

  // Find the API key by hash
  const apiKey = await apiKeyRepository.selectApiKeyByHash(keyHash);

  if (!apiKey) {
    return null;
  }

  // Validate the key (check if active, not expired, etc.)
  const validation = validateApiKey(apiKey);
  if (!validation.valid) {
    return null;
  }

  // Check rate limits
  if (!checkRateLimit(apiKey)) {
    return null; // Rate limited
  }

  // Update usage statistics
  await Promise.all([
    apiKeyRepository.incrementRequestCount(apiKey.id),
    apiKeyRepository.updateLastUsedAt(apiKey.id),
  ]);

  return {
    userId: apiKey.userId,
    apiKey,
  };
}
