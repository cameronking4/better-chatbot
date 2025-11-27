import { randomBytes, createHash } from "crypto";

const API_KEY_PREFIX = "sk_live_";
const API_KEY_LENGTH = 32; // 32 random bytes = 64 hex chars

/**
 * Generates a secure random API key
 * Format: sk_live_<64 hex characters>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(API_KEY_LENGTH).toString("hex");
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Hashes an API key using SHA-256
 * Note: For production, consider using bcrypt for slower hashing
 * SHA-256 is faster but still secure for API keys
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Verifies an API key against a hash
 */
export function verifyApiKey(key: string, hash: string): boolean {
  const keyHash = hashApiKey(key);
  return keyHash === hash;
}

/**
 * Extracts the prefix for display purposes
 * Returns first 8 characters (e.g., "sk_live_")
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 8);
}
