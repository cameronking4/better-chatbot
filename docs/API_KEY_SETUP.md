# API Key Governance Setup Guide

This guide explains how to set up and use the user-delegated API key governance feature for programmatic access to the Better Chatbot API.

## Overview

The API key governance system allows users to create and manage their own API keys for calling the chat route programmatically. This replaces the single `NEXT_PUBLIC_API_KEY` environment variable with a secure, per-user system.

## Features

- **Per-User API Keys**: Users can create multiple named API keys
- **Rate Limiting**: Configurable rate limits per key (default: 60 requests/minute)
- **Usage Tracking**: Track request count and last used timestamp
- **Expiration**: Optional expiration dates for time-limited access
- **Revocation**: Instantly revoke keys without affecting others
- **Admin Oversight**: Admins can view and manage all API keys
- **Backward Compatible**: Existing `NEXT_PUBLIC_API_KEY` continues to work

## Database Setup

### 1. Run the Migration

The API key table is defined in `/migrations/0001_add_api_key_table.sql`. Apply it to your database:

```bash
# Using the project's migration script
pnpm db:migrate

# Or manually with psql
psql $POSTGRES_URL -f migrations/0001_add_api_key_table.sql
```

### 2. Verify the Table

```sql
-- Check that the table was created
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'api_key';

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'api_key';
```

## Creating an API Key

### Via API (Programmatic)

```bash
# Authenticate with session (get auth token from browser)
curl https://your-app.com/api/api-keys \
  -H "Cookie: your-session-cookie" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Server",
    "rateLimit": 60,
    "expiresAt": "2026-12-31T23:59:59Z"
  }'
```

Response:
```json
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

**IMPORTANT**: Save the `key` value immediately. It will only be shown once!

### Via UI (Future)

A user interface for API key management will be available at:
- User Settings: `/settings/api-keys`
- Admin Dashboard: `/admin/api-keys`

## Using an API Key

### Chat API Example

```bash
curl https://your-app.com/api/chat \
  -H "Authorization: Bearer bc_live_k3mP9xQ2vN8wL5tR7yZ4bD1fG6hJ0sA2" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

### JavaScript/TypeScript Example

```typescript
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

### Python Example

```python
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

## Managing API Keys

### List Your API Keys

```bash
GET /api/api-keys
Authorization: Bearer <session-token>
```

### Get Key Details

```bash
GET /api/api-keys/:id
Authorization: Bearer <session-token>
```

### Update a Key

```bash
PATCH /api/api-keys/:id
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "name": "Production Server v2",
  "rateLimit": 120
}
```

### Revoke a Key

```bash
DELETE /api/api-keys/:id
Authorization: Bearer <session-token>
```

### Rotate a Key

```bash
POST /api/api-keys/:id/rotate
Authorization: Bearer <session-token>
```

Response includes the new key (shown only once).

## Rate Limiting

Each API key has a configurable rate limit (requests per minute).

### Rate Limit Headers

When a request is rate-limited, you'll receive a `429 Too Many Requests` response with these headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-11-27T03:00:00Z
```

### Handling Rate Limits

```typescript
const response = await fetch('/api/chat', {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
});

if (response.status === 429) {
  const data = await response.json();
  const resetAt = new Date(response.headers.get('X-RateLimit-Reset'));
  const waitMs = resetAt.getTime() - Date.now();

  console.log(`Rate limited. Retry after ${waitMs}ms`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
  // Retry request
}
```

## Admin Management

### View All API Keys

Admins can view all API keys across all users:

```bash
GET /api/admin/api-keys
Authorization: Bearer <admin-session-token>
```

### Revoke Any User's Key

Admins can revoke any API key:

```bash
DELETE /api/api-keys/:id
Authorization: Bearer <admin-session-token>
```

## Security Best Practices

1. **Never Commit Keys**: Add `*.key` to `.gitignore`
2. **Use Environment Variables**: Store keys in `.env` files (not in code)
3. **Rotate Regularly**: Rotate keys every 90 days
4. **Principle of Least Privilege**: Create keys with minimal required scopes
5. **Monitor Usage**: Regularly review usage statistics
6. **Revoke Unused Keys**: Delete keys that haven't been used in 30+ days

## Troubleshooting

### "Invalid API key" Error

1. Check that the key starts with `bc_live_`
2. Verify the key hasn't been revoked or expired
3. Ensure you're using the full key (not just the prefix)
4. Check that the Authorization header is correctly formatted

### "Rate limit exceeded" Error

1. Check the `X-RateLimit-Reset` header for when the limit resets
2. Implement exponential backoff in your client
3. Request a higher rate limit from an admin
4. Consider creating multiple keys for different services

### "Unauthorized" Error

1. Verify the Authorization header is present
2. Check that the session cookie is valid (if using session auth)
3. Ensure the key belongs to an active user account

## Migration from Legacy API Key

If you're currently using `NEXT_PUBLIC_API_KEY`:

1. **Create User API Keys**: Have each API consumer create their own key
2. **Update Clients**: Replace `NEXT_PUBLIC_API_KEY` with user keys
3. **Monitor**: Both systems work in parallel during migration
4. **Deprecate**: After migration, remove `NEXT_PUBLIC_API_KEY` from `.env`

### Backward Compatibility

The legacy `NEXT_PUBLIC_API_KEY` continues to work for backward compatibility:

```bash
# Still works (but deprecated)
curl https://your-app.com/api/chat \
  -H "Authorization: Bearer ${NEXT_PUBLIC_API_KEY}" \
  -d '{"messages": [...]}'
```

However, this will be deprecated in a future release. Please migrate to user API keys.

## API Reference

### Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/api-keys` | GET | List user's API keys | User |
| `/api/api-keys` | POST | Create new API key | User |
| `/api/api-keys/:id` | GET | Get key details | User (owner) or Admin |
| `/api/api-keys/:id` | PATCH | Update key | User (owner) or Admin |
| `/api/api-keys/:id` | DELETE | Revoke key | User (owner) or Admin |
| `/api/api-keys/:id/rotate` | POST | Rotate key | User (owner) or Admin |
| `/api/admin/api-keys` | GET | List all keys | Admin only |

### Request/Response Schemas

See [API Key Governance Implementation Guide](./api-key-governance-implementation.md) for detailed schemas.

## Support

For issues or questions:
- Check the [Design Specification](./api-key-governance-design.md)
- Review the [Implementation Guide](./api-key-governance-implementation.md)
- Open an issue on GitHub
