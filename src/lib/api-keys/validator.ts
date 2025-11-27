import { compare } from "bcrypt-ts";
import type { ApiKeyValidationResult } from "./types";
import { validateApiKeyFormat } from "./generator";

/**
 * Validate an API key against the database
 * This function should be called by the repository layer
 */
export async function validateApiKey(
  key: string,
  keyHashFromDb: string,
  apiKeyData: {
    userId: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    usageCount: string;
    rateLimit: string;
    [key: string]: unknown;
  },
): Promise<ApiKeyValidationResult> {
  // 1. Validate format
  if (!validateApiKeyFormat(key)) {
    return {
      valid: false,
      error: "Invalid API key format",
    };
  }

  // 2. Compare hash
  const isMatch = await compare(key, keyHashFromDb);
  if (!isMatch) {
    return {
      valid: false,
      error: "Invalid API key",
    };
  }

  // 3. Check if revoked
  if (apiKeyData.revokedAt) {
    return {
      valid: false,
      error: "API key has been revoked",
    };
  }

  // 4. Check if expired
  if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
    return {
      valid: false,
      error: "API key has expired",
    };
  }

  // 5. Valid key
  return {
    valid: true,
    userId: apiKeyData.userId,
    apiKey: apiKeyData as any, // Type will be properly cast by repository
  };
}

/**
 * Check if API key is active (not revoked or expired)
 */
export function isApiKeyActive(
  expiresAt: Date | null,
  revokedAt: Date | null,
): boolean {
  if (revokedAt) {
    return false;
  }

  if (expiresAt && new Date(expiresAt) < new Date()) {
    return false;
  }

  return true;
}
