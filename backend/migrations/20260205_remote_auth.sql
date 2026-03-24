-- Migration: Create remote_auth_sessions table
-- Description: Supports "Login via Browser" for the Desktop App

CREATE TABLE IF NOT EXISTS remote_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'expired', 'failed')),
    wallet_address VARCHAR(42),
    token TEXT,
    device_id TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMP WITH TIME ZONE
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_remote_auth_expires ON remote_auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_remote_auth_status ON remote_auth_sessions(status);
