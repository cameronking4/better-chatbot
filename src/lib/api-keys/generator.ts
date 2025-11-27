import { randomBytes } from "crypto";
import { hash } from "bcrypt-ts";

/**
 * Generate a cryptographically secure API key
 * Format: bc_live_<32_random_chars>
 *
 * - bc_ = Better Chatbot prefix
 * - live_ = Environment indicator
 * - 32 chars = Base62-encoded random bytes (192 bits of entropy)
 */
export async function generateApiKey(): Promise<{
  key: string;
  keyHash: string;
  keyPrefix: string;
}> {
  // Generate 24 random bytes (192 bits)
  const randomBuffer = randomBytes(24);

  // Convert to Base62 (URL-safe, human-readable)
  const randomString = base62Encode(randomBuffer);

  // Take first 32 characters
  const keySecret = randomString.substring(0, 32);

  // Construct full key with prefix
  const key = `bc_live_${keySecret}`;

  // Hash the key for storage (bcrypt with cost 10)
  const keyHash = await hash(key, 10);

  // Extract prefix for display (first 12 chars: bc_live_XXXX)
  const keyPrefix = `${key.substring(0, 12)}****`;

  return {
    key, // Full key (shown only once)
    keyHash, // Hashed key for storage
    keyPrefix, // Display prefix
  };
}

/**
 * Base62 encoding (0-9, A-Z, a-z)
 * URL-safe and human-readable
 */
function base62Encode(buffer: Buffer): string {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";

  // Convert buffer to BigInt
  let num = BigInt(`0x${buffer.toString("hex")}`);

  // Convert to base62
  while (num > 0n) {
    const remainder = Number(num % 62n);
    result = chars[remainder] + result;
    num = num / 62n;
  }

  return result || "0";
}

/**
 * Validate API key format
 * Expected format: bc_live_<32_chars>
 */
export function validateApiKeyFormat(key: string): boolean {
  const regex = /^bc_live_[A-Za-z0-9]{32}$/;
  return regex.test(key);
}

/**
 * Extract prefix from full API key for display
 */
export function extractKeyPrefix(key: string): string {
  if (!validateApiKeyFormat(key)) {
    throw new Error("Invalid API key format");
  }
  return `${key.substring(0, 12)}****`;
}
