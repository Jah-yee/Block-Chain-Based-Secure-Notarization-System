-- Migration: Create auth_nonces table
-- Purpose: Support multi-action nonce-based authentication with upsert capability
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS auth_nonces (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    action VARCHAR(50) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(wallet_address, action)
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON auth_nonces(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiry ON auth_nonces(expires_at);

COMMENT ON TABLE auth_nonces IS 'Security nonces for authentication actions (login, register, etc) with replay protection.';
