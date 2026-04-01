-- ================================================================
-- Migration: 20260401000000_hardened_state_machine.sql
-- Implements strict state machine and leasing for upload_intents
-- ================================================================

-- 1. Update status CHECK constraint on upload_intents
-- First, drop the old constraint
ALTER TABLE upload_intents DROP CONSTRAINT IF EXISTS upload_intents_status_check;

-- Add the new hardened status constraint
ALTER TABLE upload_intents ADD CONSTRAINT upload_intents_status_check 
  CHECK (status IN (
    'AWAITING_PAYMENT', 
    'PAYMENT_VERIFIED', 
    'DOC_CREATED', 
    'COMPLETED', 
    'EXPIRED', 
    'FAILED_FINAL', 
    'FAILED_RETRYABLE'
  ));

-- 2. Add Leasing Columns for Distributed Concurrency (Lease System)
ALTER TABLE upload_intents ADD COLUMN IF NOT EXISTS processing_lock_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE upload_intents ADD COLUMN IF NOT EXISTS processing_node_id UUID;

-- 3. Ensure UNIQUE(payment_tx_hash) across all layers
-- upload_intents already has it from 20260320, but we re-verify or enforce on documents too
ALTER TABLE documents DROP CONSTRAINT IF EXISTS unique_document_payment_tx;
ALTER TABLE documents ADD CONSTRAINT unique_document_payment_tx UNIQUE (payment_tx_hash);

-- Index for the scavenger
CREATE INDEX IF NOT EXISTS idx_upload_intents_scavenger 
  ON upload_intents(status, processing_lock_until) 
  WHERE status IN ('PAYMENT_VERIFIED', 'DOC_CREATED');
