# API Key Governance - Design Specification

## Overview

This document outlines the design for implementing user-delegated API key governance in Better Chatbot. This feature allows users to create and manage their own API keys for programmatic access to the chat routes, replacing the single environment-based `NEXT_PUBLIC_API_KEY` with a secure, scalable, per-user system.

## Problem Statement

### Current Limitations
- **Single API Key**: Only one environment variable (`NEXT_PUBLIC_API_KEY`) shared across all API consumers
- **No Accountability**: Cannot track which API consumer made which request
- **No Rotation**: Cannot rotate keys without affecting all consumers
- **No Granular Control**: Cannot revoke access for specific consumers
- **No Usage Analytics**: Cannot monitor API usage per consumer
- **Security Risk**: Key exposure affects entire system

### Requirements
1. Allow users to create multiple API keys
2. Each key should be independently revocable
3. Track usage per API key (request count, last used)
4. Support key rotation without service interruption
5. Implement rate limiting per key
6. Provide admin oversight for all API keys
7. Support key expiration dates
8. Allow key scopes/permissions (future extensibility)

## Architecture

### 1. Database Schema

#### API Key Table

```typescript
apiKey {
  id: string (UUID, primary key)
  userId: string (UUID, foreign key -> user.id)
  name: string (user-defined name for the key)
  keyHash: string (bcrypt hash of the actual key, indexed)
  keyPrefix: string (first 8 chars for identification, e.g., "bc_live_")
  lastUsedAt: timestamp (nullable, updated on each use)
  usageCount: bigint (counter incremented on each use)
  rateLimit: integer (requests per minute, default: 60)
  expiresAt: timestamp (nullable, when key expires)
  createdAt: timestamp (when key was created)
  updatedAt: timestamp (when key was last modified)
  revokedAt: timestamp (nullable, when key was revoked)
  scopes: json (array of permission scopes, future use)
  metadata: json (additional key-specific data)
}
```

**Indexes**:
- `keyHash` (unique, for fast lookup)
- `userId` (for user's key list)
- `keyPrefix` (for display/search)
- `expiresAt` (for cleanup jobs)

### 2. API Key Format

**Structure**: `bc_live_<random_32_chars>`
- `bc_` - Better Chatbot prefix
- `live_` - Environment indicator (live vs test)
- 32 random characters - Base62 encoded random bytes

**Example**: `bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2`

**Security**:
- Only shown once at creation
- Stored as bcrypt hash in database
- Prefix stored separately for display (`bc_live_k3mP****`)
- Validated via hash comparison (not plaintext)

### 3. Authentication Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP Request
       │ Authorization: Bearer bc_live_...
       ▼
┌──────────────────┐
│  API Middleware  │
│  (API Key Auth)  │
└──────┬───────────┘
       │ Extract & Validate
       │
       ├─► Check format
       │
       ├─► Hash key
       │
       ├─► Query database
       │   - Find by keyHash
       │   - Check not revoked
       │   - Check not expired
       │
       ├─► Rate limit check
       │   - Check usageCount vs rateLimit
       │   - Use sliding window
       │
       ├─► Update usage
       │   - Increment usageCount
       │   - Update lastUsedAt
       │
       ▼
┌──────────────────┐
│   Authorized     │
│  (userId found)  │
└──────────────────┘
```

### 4. Components

#### Backend Services

1. **API Key Generation Service** (`/src/lib/api-keys/generator.ts`)
   - Generate cryptographically secure random keys
   - Create bcrypt hashes
   - Return key object with plaintext key (shown once)

2. **API Key Validation Service** (`/src/lib/api-keys/validator.ts`)
   - Validate key format
   - Hash and compare against database
   - Check expiration and revocation
   - Update usage statistics

3. **Rate Limiter** (`/src/lib/api-keys/rate-limiter.ts`)
   - Sliding window rate limiting
   - Per-key request counting
   - Configurable limits per key

4. **Repository Layer** (`/src/lib/db/pg/repositories/api-key-repository.pg.ts`)
   - CRUD operations for API keys
   - Usage tracking queries
   - Cleanup expired keys

#### API Endpoints

1. **POST `/api/api-keys`** - Create new API key
   - Request: `{ name: string, rateLimit?: number, expiresAt?: Date, scopes?: string[] }`
   - Response: `{ id, name, key (plaintext, shown once), keyPrefix, createdAt, expiresAt }`
   - Auth: Requires authenticated user

2. **GET `/api/api-keys`** - List user's API keys
   - Response: `Array<{ id, name, keyPrefix, lastUsedAt, usageCount, createdAt, expiresAt, revokedAt }>`
   - Auth: Requires authenticated user

3. **GET `/api/api-keys/:id`** - Get single API key details
   - Response: `{ id, name, keyPrefix, lastUsedAt, usageCount, rateLimit, createdAt, expiresAt, revokedAt, scopes }`
   - Auth: Requires authenticated user (owner) or admin

4. **PATCH `/api/api-keys/:id`** - Update API key
   - Request: `{ name?: string, rateLimit?: number, expiresAt?: Date }`
   - Response: Updated key object
   - Auth: Requires authenticated user (owner) or admin

5. **DELETE `/api/api-keys/:id`** - Revoke API key
   - Sets `revokedAt` timestamp
   - Response: `{ success: true }`
   - Auth: Requires authenticated user (owner) or admin

6. **POST `/api/api-keys/:id/rotate`** - Rotate API key
   - Revokes old key and creates new one
   - Response: New key object with plaintext key
   - Auth: Requires authenticated user (owner) or admin

7. **GET `/api/admin/api-keys`** - Admin: List all API keys
   - Response: All keys across all users
   - Auth: Requires admin permission

#### Admin UI Components

1. **API Keys Management Page** (`/src/app/(chat)/(admin)/admin/api-keys/page.tsx`)
   - List all API keys with search/filter
   - Show usage statistics
   - Revoke/view key details
   - Admin-only access

2. **User Profile API Keys Tab** (`/src/app/(chat)/settings/api-keys/page.tsx`)
   - User's own API key management
   - Create new keys
   - View usage stats
   - Revoke/rotate keys
   - Copy key prefix

### 5. Security Considerations

#### Key Security
- **Hash Storage**: Never store plaintext keys (use bcrypt with cost 10)
- **One-Time Display**: Show full key only once at creation
- **Secure Generation**: Use `crypto.randomBytes()` for key generation
- **Prefix Display**: Show only `bc_live_k3mP****` in UI

#### Access Control
- **User Isolation**: Users can only manage their own keys
- **Admin Override**: Admins can view/revoke any key
- **Permission Checks**: Verify ownership on all key operations

#### Rate Limiting
- **Per-Key Limits**: Default 60 req/min, configurable per key
- **Sliding Window**: Prevents burst attacks
- **Admin Override**: Admins can set higher limits

#### Audit Trail
- **Usage Tracking**: Every API call updates `lastUsedAt` and `usageCount`
- **Revocation Tracking**: `revokedAt` timestamp preserved
- **Creation Tracking**: `createdAt` timestamp

### 6. Migration Strategy

#### Phase 1: Add Database Schema
- Create `api_key` table via migration
- Add indexes for performance

#### Phase 2: Backward Compatibility
- Keep existing `NEXT_PUBLIC_API_KEY` working
- Add new API key validation alongside old system
- Log usage of old vs new keys

#### Phase 3: Update Documentation
- Add API key creation guide
- Update API docs with new authentication method
- Provide migration guide for existing API consumers

#### Phase 4: Deprecation (Future)
- Announce deprecation of `NEXT_PUBLIC_API_KEY`
- Provide 90-day migration period
- Remove old system after migration period

### 7. Rate Limiting Implementation

#### Sliding Window Algorithm

```typescript
interface RateLimitWindow {
  requests: number[]  // Timestamps of requests in current window
  limit: number       // Max requests allowed
  windowMs: number    // Window duration (60000ms = 1 minute)
}

function checkRateLimit(key: ApiKey): boolean {
  const now = Date.now()
  const windowStart = now - key.rateLimitWindowMs

  // Remove requests outside current window
  const recentRequests = getRecentRequests(key.id, windowStart)

  if (recentRequests.length >= key.rateLimit) {
    return false // Rate limit exceeded
  }

  // Record this request
  recordRequest(key.id, now)
  return true // Within rate limit
}
```

#### Redis-based Implementation (Optional Enhancement)
- Store request counts in Redis for distributed systems
- Use sorted sets with timestamps as scores
- Auto-expire old entries

### 8. Usage Analytics

#### Metrics Tracked
1. **Request Count**: Total API calls per key
2. **Last Used**: Most recent API call timestamp
3. **Creation Date**: When key was created
4. **Active Keys**: Keys used in last 30 days

#### Admin Dashboard
- Total API calls across all users
- Most active API keys
- Recently created keys
- Keys nearing rate limits
- Expired/revoked keys

### 9. User Experience

#### Creating an API Key
1. User navigates to Settings → API Keys
2. Clicks "Create New API Key"
3. Enters key name (e.g., "Production Server")
4. Optionally sets expiration date
5. Optionally sets custom rate limit
6. Clicks "Create"
7. **Key is displayed once** with copy button
8. Warning: "Save this key now. You won't be able to see it again."

#### Using an API Key
```bash
curl https://your-app.com/api/chat \
  -H "Authorization: Bearer bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

#### Managing API Keys
- View list of all keys with prefix only
- See usage statistics (last used, total requests)
- Revoke keys instantly
- Rotate keys (creates new, revokes old)
- Rename keys for organization

### 10. Future Enhancements

#### Scopes/Permissions
```json
{
  "scopes": [
    "chat:read",
    "chat:write",
    "agent:execute",
    "workflow:execute"
  ]
}
```

#### Key Rotation Policies
- Auto-rotate keys every 90 days
- Email notifications before expiration
- Gradual rollover period

#### Advanced Rate Limiting
- Different limits per endpoint
- Burst allowance
- Cost-based limiting (tokens used)

#### Webhooks
- Notify on key usage
- Alert on rate limit exceeded
- Webhook on key creation/revocation

## Implementation Checklist

- [ ] Create database schema and migration
- [ ] Implement API key generation service
- [ ] Implement API key validation middleware
- [ ] Create API key repository layer
- [ ] Build API endpoints for key management
- [ ] Add rate limiting service
- [ ] Update chat route to use new validation
- [ ] Create user settings UI for API keys
- [ ] Create admin UI for API key oversight
- [ ] Add usage tracking and analytics
- [ ] Write integration tests
- [ ] Update API documentation
- [ ] Create migration guide for existing users

## Success Criteria

1. Users can create multiple API keys via UI
2. API keys authenticate successfully with chat endpoint
3. Revoked keys are rejected immediately
4. Expired keys are rejected automatically
5. Rate limiting works per key
6. Usage statistics are accurate
7. Admin can view and manage all keys
8. Backward compatible with existing `NEXT_PUBLIC_API_KEY`
9. Keys are cryptographically secure
10. No plaintext keys stored in database

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [RFC 7519: JWT](https://tools.ietf.org/html/rfc7519) (for future OAuth comparison)
- [Stripe API Key Design](https://stripe.com/docs/keys) (industry best practice)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
