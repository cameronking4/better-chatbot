import { ApiKey } from "@/types/api-key";

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp when the window resets
}

// In-memory rate limit store
// Key: apiKeyId, Value: RateLimitEntry
const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60 * 1000; // Clean up expired entries every minute

// Cleanup expired rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Checks if a request should be allowed based on rate limits
 * @param apiKey The API key entity
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(apiKey: ApiKey): boolean {
  // If no rate limit is set, use default (60/min)
  const rateLimit = apiKey.rateLimit ?? 60;
  const windowMs = 60 * 1000; // 1 minute window

  const now = Date.now();
  const entry = rateLimitStore.get(apiKey.id);

  if (!entry || now >= entry.resetAt) {
    // Create new window or reset existing one
    rateLimitStore.set(apiKey.id, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  // Check if limit exceeded
  if (entry.count >= rateLimit) {
    return false;
  }

  // Increment count
  entry.count++;
  return true;
}

/**
 * Gets the remaining requests in the current window
 */
export function getRemainingRequests(apiKey: ApiKey): number {
  const rateLimit = apiKey.rateLimit ?? 60;
  const entry = rateLimitStore.get(apiKey.id);

  if (!entry || Date.now() >= entry.resetAt) {
    return rateLimit;
  }

  return Math.max(0, rateLimit - entry.count);
}

/**
 * Clears rate limit data for an API key (useful for testing or manual reset)
 */
export function clearRateLimit(apiKeyId: string): void {
  rateLimitStore.delete(apiKeyId);
}
