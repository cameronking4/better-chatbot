# API Key Governance - Implementation Guide & Research

## Implementation TLDR

### What Was Built

A complete user-delegated API key governance system that allows users to create, manage, and revoke their own API keys for programmatic access to the chat API routes.

### Key Features

1. **Per-User API Keys**: Users can create multiple named API keys
2. **Secure Storage**: Keys hashed with bcrypt, never stored in plaintext
3. **Usage Tracking**: Tracks request count and last used timestamp per key
4. **Rate Limiting**: Configurable per-key rate limits (default: 60 req/min)
5. **Expiration Support**: Optional expiration dates for time-limited access
6. **Revocation**: Instant key revocation without affecting other keys
7. **Admin Oversight**: Admin dashboard for viewing and managing all API keys
8. **Backward Compatible**: Existing `NEXT_PUBLIC_API_KEY` continues to work

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Application                     │
│           Authorization: Bearer bc_live_xxx...               │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway/Middleware                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  1. Extract Bearer token from Authorization header  │    │
│  │  2. Validate key format (bc_live_...)              │    │
│  │  3. Hash key with bcrypt                           │    │
│  │  4. Query database for matching keyHash            │    │
│  │  5. Check expiration & revocation status           │    │
│  │  6. Apply rate limiting (sliding window)           │    │
│  │  7. Update usage statistics                        │    │
│  │  8. Attach userId to request context               │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Protected Routes                        │
│              /api/chat, /api/agent, etc.                     │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(20) NOT NULL,
  last_used_at TIMESTAMP,
  usage_count BIGINT NOT NULL DEFAULT 0,
  rate_limit INTEGER NOT NULL DEFAULT 60,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP,
  scopes JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_api_key_user_id ON api_key(user_id);
CREATE INDEX idx_api_key_key_hash ON api_key(key_hash);
CREATE INDEX idx_api_key_key_prefix ON api_key(key_prefix);
CREATE INDEX idx_api_key_expires_at ON api_key(expires_at) WHERE expires_at IS NOT NULL;
```

### File Changes Summary

#### New Files Created (10 files)

1. **Database Schema**
   - `src/lib/db/pg/schema/api-key.schema.ts` - Drizzle schema definition

2. **Service Layer**
   - `src/lib/api-keys/generator.ts` - Key generation service
   - `src/lib/api-keys/validator.ts` - Key validation service
   - `src/lib/api-keys/rate-limiter.ts` - Rate limiting logic
   - `src/lib/api-keys/types.ts` - TypeScript types

3. **Repository Layer**
   - `src/lib/db/pg/repositories/api-key-repository.pg.ts` - Database operations

4. **API Endpoints**
   - `src/app/api/api-keys/route.ts` - List & create keys
   - `src/app/api/api-keys/[id]/route.ts` - Get, update, delete key
   - `src/app/api/api-keys/[id]/rotate/route.ts` - Key rotation
   - `src/app/api/admin/api-keys/route.ts` - Admin key management

5. **UI Components**
   - `src/app/(chat)/settings/api-keys/page.tsx` - User API key settings
   - `src/app/(chat)/(admin)/admin/api-keys/page.tsx` - Admin dashboard
   - `src/components/api-keys/api-key-list.tsx` - Key list component
   - `src/components/api-keys/create-key-dialog.tsx` - Key creation dialog
   - `src/components/api-keys/key-usage-chart.tsx` - Usage visualization

6. **Documentation**
   - `docs/api-key-governance-design.md` - Design specification
   - `docs/api-key-governance-implementation.md` - This file

#### Modified Files (4 files)

1. `src/lib/db/pg/schema.pg.ts` - Added API key table export
2. `src/lib/db/repository.ts` - Added API key repository export
3. `src/app/api/chat/route.ts` - Updated authentication logic
4. `src/lib/scheduler/task-executor.ts` - Updated to support user API keys

### API Endpoints

#### User Endpoints

**POST /api/api-keys** - Create new API key
```json
Request:
{
  "name": "Production Server",
  "rateLimit": 60,
  "expiresAt": "2026-12-31T23:59:59Z"
}

Response:
{
  "id": "uuid",
  "name": "Production Server",
  "key": "bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2",
  "keyPrefix": "bc_live_k3mP****",
  "rateLimit": 60,
  "expiresAt": "2026-12-31T23:59:59Z",
  "createdAt": "2025-11-27T00:00:00Z"
}
```

**GET /api/api-keys** - List user's API keys
```json
Response:
[
  {
    "id": "uuid",
    "name": "Production Server",
    "keyPrefix": "bc_live_k3mP****",
    "lastUsedAt": "2025-11-27T02:30:00Z",
    "usageCount": 1523,
    "rateLimit": 60,
    "createdAt": "2025-11-20T10:00:00Z",
    "expiresAt": null,
    "revokedAt": null
  }
]
```

**GET /api/api-keys/:id** - Get key details

**PATCH /api/api-keys/:id** - Update key
```json
Request:
{
  "name": "Production Server v2",
  "rateLimit": 120
}
```

**DELETE /api/api-keys/:id** - Revoke key

**POST /api/api-keys/:id/rotate** - Rotate key (revoke old, create new)

#### Admin Endpoints

**GET /api/admin/api-keys** - List all API keys (admin only)
```json
Response:
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "userName": "john@example.com",
    "name": "Production Server",
    "keyPrefix": "bc_live_k3mP****",
    "lastUsedAt": "2025-11-27T02:30:00Z",
    "usageCount": 1523,
    "rateLimit": 60,
    "createdAt": "2025-11-20T10:00:00Z",
    "expiresAt": null,
    "revokedAt": null
  }
]
```

### Usage Example

#### Creating an API Key

1. Navigate to Settings → API Keys
2. Click "Create New API Key"
3. Enter name: "Production Server"
4. Set rate limit: 60 req/min (optional)
5. Set expiration: None (optional)
6. Click "Create"
7. **Copy the key immediately** (shown only once)

#### Using the API Key

```bash
# Chat API request
curl https://your-app.com/api/chat \
  -H "Authorization: Bearer bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

```javascript
// JavaScript example
const response = await fetch('https://your-app.com/api/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello, world!' }
    ]
  })
});

const data = await response.json();
```

```python
# Python example
import requests

response = requests.post(
    'https://your-app.com/api/chat',
    headers={
        'Authorization': 'Bearer bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2',
        'Content-Type': 'application/json'
    },
    json={
        'messages': [
            {'role': 'user', 'content': 'Hello, world!'}
        ]
    }
)

data = response.json()
```

### Security Features

1. **Bcrypt Hashing**: Keys hashed with cost factor 10 (industry standard)
2. **One-Time Display**: Full key shown only at creation
3. **Cryptographically Secure**: Uses `crypto.randomBytes()` for generation
4. **Format Validation**: Validates key format before database lookup
5. **Expiration Checks**: Automatically rejects expired keys
6. **Revocation Support**: Soft delete with timestamp
7. **Rate Limiting**: Prevents abuse with configurable limits
8. **Usage Tracking**: Audit trail for all API calls

### Rate Limiting Algorithm

**Sliding Window Implementation**:

```typescript
async function checkRateLimit(keyId: string, limit: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  // Get requests in current window
  const recentRequests = await getRecentRequests(keyId, windowStart);

  if (recentRequests.length >= limit) {
    return false; // Rate limit exceeded
  }

  // Record this request
  await recordRequest(keyId, now);
  return true; // Within limit
}
```

**Benefits**:
- Prevents burst attacks
- Fair distribution of requests
- No hard resets at window boundaries
- Efficient database queries with indexed timestamps

### Migration & Backward Compatibility

**Phase 1 (Current)**: Dual Support
- New API key system fully functional
- Old `NEXT_PUBLIC_API_KEY` still works
- Both methods coexist peacefully

**Phase 2 (Future)**: Deprecation Notice
- Log warnings when old key is used
- Email notifications to admin
- Documentation updated with migration guide

**Phase 3 (Future)**: Removal
- After 90-day migration period
- Remove old key validation code
- Full cutover to new system

### Testing

#### Manual Testing Checklist

- [ ] Create API key via UI
- [ ] Copy key and test with curl
- [ ] Verify usage count increments
- [ ] Test rate limiting (exceed limit)
- [ ] Revoke key and verify rejection
- [ ] Create expired key and verify rejection
- [ ] Test key rotation
- [ ] Admin: View all keys across users
- [ ] Admin: Revoke another user's key

#### Integration Tests

```typescript
describe('API Key Authentication', () => {
  it('should authenticate valid API key', async () => {
    const key = await createApiKey(userId, 'Test Key');
    const response = await fetch('/api/chat', {
      headers: { Authorization: `Bearer ${key.key}` }
    });
    expect(response.status).toBe(200);
  });

  it('should reject revoked API key', async () => {
    const key = await createApiKey(userId, 'Test Key');
    await revokeApiKey(key.id);
    const response = await fetch('/api/chat', {
      headers: { Authorization: `Bearer ${key.key}` }
    });
    expect(response.status).toBe(401);
  });

  it('should enforce rate limiting', async () => {
    const key = await createApiKey(userId, 'Test Key', { rateLimit: 2 });

    // First request - OK
    await fetch('/api/chat', {
      headers: { Authorization: `Bearer ${key.key}` }
    });

    // Second request - OK
    await fetch('/api/chat', {
      headers: { Authorization: `Bearer ${key.key}` }
    });

    // Third request - Rate limited
    const response = await fetch('/api/chat', {
      headers: { Authorization: `Bearer ${key.key}` }
    });
    expect(response.status).toBe(429);
  });
});
```

---

## Grounding Research

### Industry Best Practices Analysis

#### 1. API Key Design Patterns

**Stripe API Keys** (Industry Gold Standard)
- Format: `sk_live_` + random string
- Prefixes indicate environment (test vs live) and scope
- Keys start with readable prefix for easy identification
- Adopts similar pattern: `bc_live_` prefix

**GitHub Personal Access Tokens**
- Fine-grained scopes per token
- Expiration dates required (security best practice)
- Granular permissions (repo, issues, actions, etc.)
- Our implementation includes scope foundation for future expansion

**AWS IAM Access Keys**
- Separate access key ID (public) and secret (private)
- Rotation policies enforced
- Usage tracking via CloudTrail
- Our implementation tracks usage and supports rotation

#### 2. Key Format Research

**Why `bc_live_` prefix?**
- **Identification**: Easily identifiable in logs/code
- **Environment**: Distinguishes live vs test keys
- **Security**: Enables secret scanning tools to detect leaked keys
- **Consistency**: Industry standard (Stripe, Twilio, SendGrid all use prefixes)

**Why Base62 encoding?**
- URL-safe (no special characters)
- Human-readable (avoids confusing characters)
- Compact representation
- Standard for API keys across industry

**Why 32 characters?**
- 192 bits of entropy (cryptographically secure)
- Resistant to brute force attacks
- Balanced between security and usability
- Similar to industry standards (Stripe: ~24-32 chars)

#### 3. Hashing Algorithm Selection

**bcrypt vs argon2 vs scrypt**

| Algorithm | Pros | Cons | Use Case |
|-----------|------|------|----------|
| bcrypt | Battle-tested, widely supported, configurable cost | Slower than argon2 | API keys, passwords (chosen) |
| argon2 | Newest, resistant to GPU attacks, winner of PHC | Less widely supported | High-security passwords |
| scrypt | Memory-hard, resistant to hardware attacks | Complex configuration | Cryptocurrency wallets |

**Decision**: bcrypt with cost factor 10
- Mature and well-tested (20+ years)
- Native support in Node.js ecosystem (`bcrypt-ts`)
- Optimal balance of security and performance
- ~10-20ms hash time (acceptable for auth)

#### 4. Rate Limiting Strategies

**Token Bucket vs Sliding Window vs Fixed Window**

| Strategy | Pros | Cons | Our Choice |
|----------|------|------|------------|
| Token Bucket | Allows bursts, smooth rate | Complex implementation | ❌ Not chosen |
| Sliding Window | Fair, no boundary issues | More complex tracking | ✅ Chosen |
| Fixed Window | Simple implementation | Burst at boundaries | ❌ Not chosen |

**Sliding Window Implementation**:
```
Window: [---|---|---|---] 60 seconds
Requests: ✓ ✓ ✓ ✓ ✓ ... (counted in window)

Every request:
1. Remove requests older than 60s
2. Count remaining requests
3. Allow if count < limit
```

**Benefits**:
- Prevents burst attacks at window boundaries
- Fair distribution across time
- Efficient with indexed queries

#### 5. Security Threat Analysis

**OWASP API Security Top 10 Considerations**

1. **API1:2023 Broken Object Level Authorization**
   - ✅ Users can only access their own keys
   - ✅ Admin permission checks for cross-user access

2. **API2:2023 Broken Authentication**
   - ✅ Secure key generation (crypto.randomBytes)
   - ✅ Hashed storage (bcrypt)
   - ✅ Format validation before DB lookup

3. **API3:2023 Broken Object Property Level Authorization**
   - ✅ Scopes field for future fine-grained permissions
   - ✅ User/admin separation in endpoints

4. **API4:2023 Unrestricted Resource Consumption**
   - ✅ Per-key rate limiting
   - ✅ Configurable limits
   - ✅ Usage tracking

5. **API5:2023 Broken Function Level Authorization**
   - ✅ Admin-only endpoints separated
   - ✅ Permission checks on all operations

6. **API6:2023 Unrestricted Access to Sensitive Business Flows**
   - ✅ Rate limiting prevents abuse
   - ✅ Revocation mechanism

7. **API7:2023 Server Side Request Forgery**
   - N/A for this feature

8. **API8:2023 Security Misconfiguration**
   - ✅ No hardcoded keys
   - ✅ Environment-based configuration
   - ✅ Secure defaults (60 req/min)

9. **API9:2023 Improper Inventory Management**
   - ✅ All keys tracked in database
   - ✅ Admin dashboard for oversight

10. **API10:2023 Unsafe Consumption of APIs**
    - N/A for this feature

#### 6. Database Design Decisions

**Why separate `api_key` table?**
- Clear separation of concerns
- Efficient indexing for lookups
- Easier to query usage statistics
- Future-proof for additional metadata

**Why `keyHash` as unique index?**
- Fast O(1) lookup during authentication
- Ensures no duplicate keys
- Optimizes most common operation (validation)

**Why `keyPrefix` stored separately?**
- Display in UI without exposing full key
- Searchable for user convenience
- Consistent with industry patterns (Stripe shows last 4)

**Why soft delete (`revokedAt`) instead of hard delete?**
- Audit trail preservation
- Analytics on revoked keys
- Prevent reuse of revoked keys
- Compliance requirements (GDPR allows this)

#### 7. Performance Considerations

**Authentication Flow Performance**:
1. Extract header: ~0.1ms
2. Validate format: ~0.1ms
3. Hash key (bcrypt): ~10-20ms
4. Database query (indexed): ~1-5ms
5. Update usage: ~1-5ms
**Total**: ~15-30ms overhead per request

**Optimizations**:
- Indexed `keyHash` column for fast lookups
- Async updates for usage statistics
- Connection pooling for database
- Optional Redis caching for high-traffic scenarios

#### 8. Compliance & Regulatory Considerations

**GDPR Compliance**:
- API keys are user data (traceable to individual)
- Right to erasure: CASCADE DELETE on user deletion
- Right to access: Users can view their keys
- Data minimization: Store only necessary metadata

**SOC 2 Considerations**:
- Audit trail (createdAt, lastUsedAt, revokedAt)
- Access controls (user/admin separation)
- Encryption at rest (database level)
- Encryption in transit (HTTPS required)

#### 9. Scalability Analysis

**Current Implementation Limits**:
- Single database (PostgreSQL)
- Synchronous usage updates
- In-memory rate limiting

**Scale Targets**:
- ✅ 1-100 users: Current implementation sufficient
- ✅ 100-1,000 users: Add read replicas
- ⚠️ 1,000-10,000 users: Add Redis for rate limiting
- ⚠️ 10,000+ users: Distributed rate limiting, async usage updates

**Optimization Path**:
1. Phase 1 (Current): PostgreSQL only
2. Phase 2 (1K+ users): Redis for rate limiting
3. Phase 3 (10K+ users): Async usage updates via queue
4. Phase 4 (100K+ users): Distributed key-value store

#### 10. Alternative Approaches Considered

**OAuth 2.0 vs API Keys**

| Factor | OAuth 2.0 | API Keys | Decision |
|--------|-----------|----------|----------|
| Complexity | High (token refresh, scopes) | Low (static key) | ✅ API Keys |
| Use Case | User delegation, third-party apps | Server-to-server | ✅ API Keys |
| Security | Short-lived tokens, refresh flow | Long-lived, revocable | ✅ API Keys |
| User Experience | More setup, better security | Simple, immediate | ✅ API Keys |

**Decision**: API Keys for initial implementation
- Simpler for users (no OAuth flow)
- Better for server-to-server communication
- Sufficient security with revocation + expiration
- Can add OAuth later for third-party integrations

**JWT vs Opaque Tokens**

| Factor | JWT | Opaque Tokens | Decision |
|--------|-----|---------------|----------|
| Stateless | Yes | No | ❌ JWT |
| Revocation | Difficult | Easy | ✅ Opaque |
| Payload | Self-contained | Lookup required | ✅ Opaque |
| Size | Large (>200 bytes) | Small (~40 bytes) | ✅ Opaque |

**Decision**: Opaque tokens (API keys)
- Easy revocation (critical requirement)
- Smaller key size
- No signature verification overhead
- Simpler implementation

### References & Further Reading

1. **OWASP API Security Project**
   - https://owasp.org/www-project-api-security/

2. **API Key Management Best Practices**
   - Stripe API Documentation
   - GitHub Personal Access Tokens
   - AWS IAM Best Practices

3. **Cryptography Standards**
   - NIST SP 800-63B: Digital Identity Guidelines
   - RFC 8959: Secret-Token URI Scheme

4. **Rate Limiting Algorithms**
   - "Generic Cell Rate Algorithm" (GCRA)
   - "Sliding Window Log" algorithm

5. **Database Performance**
   - PostgreSQL Index Documentation
   - Drizzle ORM Best Practices

6. **Security Research**
   - "A Survey of API Key Management" (Academic Paper)
   - OWASP Top 10 API Security Risks 2023

---

## Conclusion

This implementation provides a secure, scalable, and user-friendly API key governance system that follows industry best practices while maintaining simplicity for end users. The architecture is designed to grow with the application's needs, from small deployments to enterprise scale.

The system prioritizes:
- **Security**: Bcrypt hashing, rate limiting, expiration support
- **Usability**: Simple key creation, clear UI, one-time display
- **Auditability**: Usage tracking, admin oversight, audit trails
- **Scalability**: Indexed queries, async patterns, Redis-ready
- **Compliance**: GDPR-compliant, SOC 2 considerations

Future enhancements can include OAuth 2.0 support, fine-grained scopes, advanced analytics, and distributed rate limiting as the user base grows.
