export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  expiresAt: string | null;
  rateLimit: number | null;
  isActive: boolean;
}

export interface CreateApiKeyRequest {
  name: string;
  expiresAt?: string | null;
  rateLimit?: number | null;
}

export interface UpdateApiKeyRequest {
  name?: string;
  expiresAt?: string | null;
  rateLimit?: number | null;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  rateLimit: number | null;
}
