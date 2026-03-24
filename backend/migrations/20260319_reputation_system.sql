-- ====================================================
-- Phase 4: Reputation System Database Migration
-- ====================================================

-- 1. Add reputation columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS raw_reputation FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_reputation FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW();

-- Index on effective_reputation for fast weighted queries
CREATE INDEX IF NOT EXISTS idx_users_effective_rep ON users(effective_reputation DESC);

-- ====================================================
-- 2. reputation_events table
-- Immutable audit log of every score-affecting event.
-- ====================================================
CREATE TABLE IF NOT EXISTS reputation_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('APPROVE', 'REJECT', 'DISPUTE', 'GOVERNANCE')),
    score_delta FLOAT NOT NULL,
    document_id INT REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for per-user history queries (used by worker)
CREATE INDEX IF NOT EXISTS idx_reputation_events_user_id ON reputation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_doc_event ON reputation_events(document_id, event_type);

-- ====================================================
-- 3. disputes table
-- Tracks owner-submitted disputes and admin resolution.
-- ====================================================
CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    submitted_by INT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolved_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for admin dispute queue
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_document_id ON disputes(document_id);

-- ====================================================
-- 4. Add 'assigned' to documents.submission_state
-- ====================================================
-- submission_state is VARCHAR so no enum change needed.
-- The value 'assigned' is now valid alongside: pending, submitted_to_blockchain, rejected, failed
