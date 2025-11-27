// API Key types and interfaces

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  usageCount: bigint;
  rateLimit: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  scopes: string[];
  metadata: Record<string, unknown>;
}

export interface ApiKeyWithPlaintext extends Omit<ApiKey, "keyHash"> {
  key: string; // Only available at creation time
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  rateLimit?: number;
  expiresAt?: Date;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateApiKeyInput {
  name?: string;
  rateLimit?: number;
  expiresAt?: Date;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  apiKey?: ApiKey;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}
