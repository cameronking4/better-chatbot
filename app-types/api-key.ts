export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyWithFullKey extends ApiKey {
  fullKey: string; // Only available at creation time
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: Date | null;
  scopes?: string[];
}

export interface UpdateApiKeyInput {
  name?: string;
  expiresAt?: Date | null;
}

export interface ApiKeyRepository {
  create(
    userId: string,
    input: CreateApiKeyInput,
  ): Promise<ApiKeyWithFullKey>;
  list(userId: string): Promise<ApiKey[]>;
  getById(id: string, userId: string): Promise<ApiKey | null>;
  getByPrefix(prefix: string): Promise<ApiKey | null>;
  update(
    id: string,
    userId: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKey>;
  revoke(id: string, userId: string): Promise<void>;
  verify(key: string): Promise<{ valid: boolean; userId?: string }>;
  updateLastUsed(id: string): Promise<void>;
  countActiveKeys(userId: string): Promise<number>;
}

export const API_KEY_SCOPES = {
  CHAT_READ: "chat:read",
  CHAT_WRITE: "chat:write",
} as const;

export const DEFAULT_SCOPES = [
  API_KEY_SCOPES.CHAT_READ,
  API_KEY_SCOPES.CHAT_WRITE,
];

export const MAX_ACTIVE_KEYS_PER_USER = 10;
