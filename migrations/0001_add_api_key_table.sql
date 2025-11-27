-- Migration: Add API Key Table for User-Delegated API Key Governance
-- Description: Creates the api_key table for storing user-generated API keys
-- Date: 2025-11-27
-- Issue: #11

-- Create the api_key table
CREATE TABLE IF NOT EXISTS api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(20) NOT NULL,
  last_used_at TIMESTAMP,
  usage_count TEXT NOT NULL DEFAULT '0',
  rate_limit TEXT NOT NULL DEFAULT '60',
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  scopes JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_key_user_id ON api_key(user_id);
CREATE INDEX IF NOT EXISTS idx_api_key_key_hash ON api_key(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_key_key_prefix ON api_key(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_key_expires_at ON api_key(expires_at) WHERE expires_at IS NOT NULL;

-- Add comment to table
COMMENT ON TABLE api_key IS 'User-generated API keys for programmatic access to the chat API';
COMMENT ON COLUMN api_key.key_hash IS 'Bcrypt hash of the API key (never store plaintext)';
COMMENT ON COLUMN api_key.key_prefix IS 'First 12 characters of the key for display (e.g., bc_live_XXXX****)';
COMMENT ON COLUMN api_key.usage_count IS 'Number of times this key has been used (stored as text to avoid bigint issues)';
COMMENT ON COLUMN api_key.rate_limit IS 'Requests per minute allowed for this key (stored as text)';
COMMENT ON COLUMN api_key.revoked_at IS 'Timestamp when the key was revoked (soft delete)';
COMMENT ON COLUMN api_key.scopes IS 'Array of permission scopes (for future use)';
