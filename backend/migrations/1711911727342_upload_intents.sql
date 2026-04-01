-- ================================================================
-- Migration: 20260320_upload_intents.sql
-- Blockchain-first NTKR payment — upload intent system
-- ================================================================

-- 1. Upload intents: hold temp file + pending payment state
CREATE TABLE IF NOT EXISTS upload_intents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  filename      TEXT NOT NULL,
  filepath      TEXT NOT NULL,       -- temp file on disk, cleaned on expiry
  category      INTEGER NOT NULL DEFAULT 0,
  amount        NUMERIC NOT NULL,    -- NTKR cost in whole tokens (e.g. 1 or 5)
  amount_wei    TEXT NOT NULL,       -- full 18-decimal string for on-chain exact match
  status        TEXT NOT NULL DEFAULT 'awaiting_payment'
                  CHECK (status IN ('awaiting_payment','completed','expired','failed')),
  payment_tx_hash TEXT UNIQUE,       -- set on confirm; UNIQUE prevents replay
  created_at    TIMESTAMP DEFAULT NOW(),
  expires_at    TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_upload_intents_user
  ON upload_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_intents_status
  ON upload_intents(status);
CREATE INDEX IF NOT EXISTS idx_upload_intents_expires
  ON upload_intents(expires_at) WHERE status = 'awaiting_payment';
CREATE INDEX IF NOT EXISTS idx_upload_intents_hash
  ON upload_intents(file_hash);

-- 2. Link documents to their on-chain payment proof
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS payment_tx_hash TEXT UNIQUE;
