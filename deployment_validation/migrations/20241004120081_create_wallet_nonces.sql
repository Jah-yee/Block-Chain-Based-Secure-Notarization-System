-- Migration: 009_create_wallet_nonces.sql
-- Create wallet_nonces table for nonce-based authentication

CREATE TABLE IF NOT EXISTS wallet_nonces (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,
    nonce VARCHAR(64) UNIQUE NOT NULL,
    expiry TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_nonces_wallet_address ON wallet_nonces(wallet_address);
