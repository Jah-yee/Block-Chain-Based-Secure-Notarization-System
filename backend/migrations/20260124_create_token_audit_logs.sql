-- Migration: Create Comprehensive Token Audit Table
-- Purpose: Track all token operations (Mint, Burn, Buy) for transparency and compliance
-- Created: 2026-01-24

CREATE TABLE IF NOT EXISTS token_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'NTK_MINT', 'NTKR_MINT', 'NTKR_BURN', 'PACKAGE_BUY', 'DOC_ACTION_BURN'
    amount DECIMAL(36, 18),
    tx_hash VARCHAR(66),
    relayer_address VARCHAR(42),
    status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'FAILED'
    metadata JSONB, -- Additional data like packageId, category, etc.
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_audit_user ON token_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_wallet ON token_audit_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_audit_action ON token_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_token_audit_created ON token_audit_logs(created_at);

COMMENT ON TABLE token_audit_logs IS 'Unified audit trail for all token-related operations across NTK and NTKR ecosystems.';
