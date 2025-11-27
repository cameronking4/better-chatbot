import type { RateLimitResult } from "./types";

/**
 * Simple in-memory rate limiter using sliding window algorithm
 *
 * For production deployments with multiple instances, consider using Redis
 * with sorted sets for distributed rate limiting.
 */

interface RequestLog {
  timestamps: number[];
  windowMs: number;
}

// In-memory storage for request logs
const requestLogs = new Map<string, RequestLog>();

/**
 * Check if a request is within the rate limit
 * Uses sliding window algorithm
 *
 * @param keyId - API key ID
 * @param limit - Maximum requests allowed per window (per minute)
 * @param windowMs - Window duration in milliseconds (default: 60000 = 1 minute)
 */
export function checkRateLimit(
  keyId: string,
  limit: number,
  windowMs: number = 60000,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Get or create request log for this key
  let log = requestLogs.get(keyId);
  if (!log) {
    log = { timestamps: [], windowMs };
    requestLogs.set(keyId, log);
  }

  // Remove requests outside the current window
  log.timestamps = log.timestamps.filter((ts) => ts > windowStart);

  // Check if limit exceeded
  if (log.timestamps.length >= limit) {
    const oldestTimestamp = log.timestamps[0];
    const resetAt = new Date(oldestTimestamp + windowMs);

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
    };
  }

  // Record this request
  log.timestamps.push(now);

  const remaining = limit - log.timestamps.length;
  const resetAt = new Date(now + windowMs);

  return {
    allowed: true,
    limit,
    remaining,
    resetAt,
  };
}

/**
 * Reset rate limit for a specific key
 * Useful for testing or admin overrides
 */
export function resetRateLimit(keyId: string): void {
  requestLogs.delete(keyId);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(
  keyId: string,
  limit: number,
  windowMs: number = 60000,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const log = requestLogs.get(keyId);
  if (!log) {
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAt: new Date(now + windowMs),
    };
  }

  // Count requests in current window (without modifying)
  const activeRequests = log.timestamps.filter((ts) => ts > windowStart).length;
  const remaining = Math.max(0, limit - activeRequests);
  const allowed = activeRequests < limit;

  const resetAt = log.timestamps[0]
    ? new Date(log.timestamps[0] + windowMs)
    : new Date(now + windowMs);

  return {
    allowed,
    limit,
    remaining,
    resetAt,
  };
}

/**
 * Cleanup old request logs periodically
 * Call this from a background job/cron
 */
export function cleanupOldLogs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [keyId, log] of requestLogs.entries()) {
    log.timestamps = log.timestamps.filter((ts) => now - ts < maxAgeMs);
    if (log.timestamps.length === 0) {
      requestLogs.delete(keyId);
    }
  }
}

// Optional: Run cleanup every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => cleanupOldLogs(), 3600000);
}
