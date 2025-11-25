-- Create API user for API key authentication
-- This user is required for the CHAT_API_KEY authentication to work
-- The UUID 00000000-0000-0000-0000-000000000000 is reserved for API requests

INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'api@system',
  'API User',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
