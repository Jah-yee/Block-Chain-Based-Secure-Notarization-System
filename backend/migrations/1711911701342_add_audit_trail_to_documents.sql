-- Migration: 202601061745_add_audit_trail_to_documents.sql
-- Adds audit trail columns to the documents table

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS approved_by TEXT;

COMMENT ON COLUMN documents.approved_by IS 'Wallet address of the notary or admin who finalized the document (Approved/Rejected)';
COMMENT ON COLUMN documents.approval_tx_hash IS 'Real blockchain transaction hash from the burn event';
