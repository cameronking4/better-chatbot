# API Key Governance

## Overview

This feature enables users to create and manage their own API keys for programmatic access to the chat API. Each user can create up to 10 active API keys that are securely stored and can be revoked at any time.

## Features

- **User-Scoped Keys**: Each API key belongs to a specific user and operates with that user's permissions
- **Secure Storage**: Keys are hashed using bcrypt before storage
- **One-Time Display**: Full key is only shown once at creation
- **Usage Tracking**: Track when each key was last used
- **Easy Management**: Create, view, and revoke keys through the user profile interface
- **Backwards Compatible**: Maintains support for the legacy system-wide `NEXT_PUBLIC_API_KEY`

## Getting Started

### Creating an API Key

1. Navigate to your user profile (click your avatar in the sidebar)
2. Scroll to the "API Keys" section
3. Click "Create Key"
4. Enter a descriptive name (e.g., "Production Bot", "CI/CD Pipeline")
5. Click "Create Key"
6. **Important**: Copy and save the key immediately - it will only be shown once!

### Using an API Key

Send requests to the chat API with the `Authorization` header:

```bash
curl -X POST https://your-instance.com/api/chat \
  -H "Authorization: Bearer bcb_live_YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "thread-id",
    "message": {
      "id": "msg-1",
      "role": "user",
      "parts": [{"type": "text", "text": "Hello!"}]
    },
    "chatModel": {
      "provider": "openai",
      "model": "gpt-4"
    }
  }'
```

### Key Format

API keys follow this format:
- `bcb_live_<32_random_characters>` for production use (bcb = Better ChatBot)
- `bcb_test_<32_random_characters>` for testing (reserved for future use)

Example: `bcb_live_xxXXxxXXyyYYzzZZ00112233445566`

### Revoking an API Key

1. Navigate to your user profile
2. Find the key in the "API Keys" section
3. Click the trash icon next to the key
4. Confirm the revocation

**Note**: Revoking a key is permanent and cannot be undone. Applications using the revoked key will immediately lose access.

## Security Best Practices

1. **Never commit API keys to version control**
2. **Store keys in environment variables or secret management systems**
3. **Use descriptive names** to track where each key is used
4. **Revoke unused keys** to minimize security risks
5. **Monitor the "Last Used" timestamp** to detect unauthorized usage
6. **Create separate keys** for different applications or environments

## API Reference

### List API Keys

```http
GET /api/user/api-keys
Authorization: Session Cookie (user must be authenticated)
```

Response:
```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "Production Bot",
      "keyPrefix": "sk_live_a1b2c3d",
      "scopes": ["chat:read", "chat:write"],
      "lastUsedAt": "2025-11-27T12:00:00Z",
      "expiresAt": null,
      "revokedAt": null,
      "createdAt": "2025-11-20T10:00:00Z",
      "updatedAt": "2025-11-20T10:00:00Z"
    }
  ]
}
```

### Create API Key

```http
POST /api/user/api-keys
Authorization: Session Cookie (user must be authenticated)
Content-Type: application/json

{
  "name": "Production Bot",
  "expiresAt": null,
  "scopes": ["chat:read", "chat:write"]
}
```

Response:
```json
{
  "key": {
    "id": "uuid",
    "name": "Production Bot",
    "keyPrefix": "bcb_live_xxXXxxX",
    "fullKey": "bcb_live_xxXXxxXXyyYYzzZZ00112233445566",
    "scopes": ["chat:read", "chat:write"],
    "expiresAt": null,
    "createdAt": "2025-11-20T10:00:00Z"
  }
}
```

**Important**: The `fullKey` field is only returned on creation and will never be shown again.

### Revoke API Key

```http
DELETE /api/user/api-keys/:id
Authorization: Session Cookie (user must be authenticated)
```

Response:
```json
{
  "success": true
}
```

## Limitations

- Maximum of 10 active API keys per user
- Keys cannot be recovered once revoked
- Full key is only shown once at creation
- Keys are scoped to the user who created them

## Backwards Compatibility

The legacy system-wide API key (`NEXT_PUBLIC_API_KEY` or `CHAT_API_KEY` environment variable) continues to work for backwards compatibility. However, we recommend migrating to user-governed API keys for better security and auditability.

## Implementation Details

### Database Schema

```sql
CREATE TABLE api_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] DEFAULT ARRAY['chat:read', 'chat:write'],
  last_used_at timestamp,
  expires_at timestamp,
  revoked_at timestamp,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);
```

### Authentication Flow

1. Extract Bearer token from `Authorization` header
2. Check if it's the legacy system key (backwards compatibility)
3. If not, verify it's a user-governed key (`sk_live_` or `sk_test_` prefix)
4. Look up key by prefix (fast index lookup)
5. Verify hash using bcrypt
6. Check key is not revoked or expired
7. Update `last_used_at` timestamp asynchronously
8. Proceed with authenticated userId

### Key Generation

Keys are generated using `nanoid` with 32 random characters, providing approximately 2^190 possible combinations, making brute-force attacks infeasible.

## Troubleshooting

### "Invalid API key" error

- Ensure the key starts with `sk_live_` or `sk_test_`
- Check that the key hasn't been revoked
- Verify the key hasn't expired
- Make sure you copied the entire key

### "Maximum number of active API keys reached"

- You have 10 or more active API keys
- Revoke unused keys before creating new ones

### Key not working after creation

- The key may have been copied incorrectly
- Ensure there are no extra spaces or line breaks
- Try creating a new key if the issue persists

## Support

For issues or questions about API key governance, please:
1. Check this documentation
2. Review the implementation in `src/app/api/user/api-keys/`
3. Open an issue on the GitHub repository
