-- Migration: Create NTK Mint Audit Table
-- Purpose: Track all NTK daily mint attempts for accountability and debugging
-- Created: 2026-01-15

CREATE TABLE IF NOT EXISTS ntk_mint_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66),
    relayer_address VARCHAR(42) NOT NULL,
    amount DECIMAL(20, 18) DEFAULT 100,
    status VARCHAR(20) NOT NULL, -- 'SUCCESS' or 'FAILED'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ntk_mint_wallet ON ntk_mint_audit(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ntk_mint_created ON ntk_mint_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ntk_mint_status ON ntk_mint_audit(status);

-- Comment for documentation
COMMENT ON TABLE ntk_mint_audit IS 'Audit trail for NTK daily mint operations. Records every attempt, success or failure.';
COMMENT ON COLUMN ntk_mint_audit.status IS 'SUCCESS: Mint succeeded on-chain. FAILED: Contract rejected (e.g., already minted today).';
