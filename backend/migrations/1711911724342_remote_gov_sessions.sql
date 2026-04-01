-- Migration: Create remote_gov_sessions table
-- Description: Supports remote governance voting from the desktop app

CREATE TABLE IF NOT EXISTS remote_gov_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id INTEGER REFERENCES governance_proposals(id),
    decision TEXT NOT NULL,
    challenge TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'expired', 'failed')),
    wallet_address VARCHAR(42),
    signature TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_remote_gov_expires ON remote_gov_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_remote_gov_status ON remote_gov_sessions(status);
