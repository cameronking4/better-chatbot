import { ApiKey } from "@/types/api-key";

const API_KEY_PREFIX = "sk_live_";
const MIN_KEY_LENGTH = API_KEY_PREFIX.length + 32; // prefix + minimum random part

/**
 * Validates API key format
 */
export function validateApiKeyFormat(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  if (key.length < MIN_KEY_LENGTH) {
    return false;
  }

  // Check that the part after prefix is valid hex
  const randomPart = key.substring(API_KEY_PREFIX.length);
  if (!/^[0-9a-f]+$/i.test(randomPart)) {
    return false;
  }

  return true;
}

/**
 * Checks if an API key has expired
 */
export function isKeyExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) {
    return false;
  }

  const expirationDate =
    expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return expirationDate < new Date();
}

/**
 * Checks if an API key is active (not revoked)
 */
export function isKeyActive(apiKey: ApiKey): boolean {
  return apiKey.isActive && !isKeyExpired(apiKey.expiresAt);
}

/**
 * Validates an API key entity
 */
export function validateApiKey(apiKey: ApiKey | null): {
  valid: boolean;
  error?: string;
} {
  if (!apiKey) {
    return { valid: false, error: "API key not found" };
  }

  if (!apiKey.isActive) {
    return { valid: false, error: "API key has been revoked" };
  }

  if (isKeyExpired(apiKey.expiresAt)) {
    return { valid: false, error: "API key has expired" };
  }

  return { valid: true };
}
