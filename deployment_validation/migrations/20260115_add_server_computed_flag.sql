-- Migration: Add server_computed flag to track hash authority
-- Purpose: Distinguish server-computed hashes from client-provided (untrusted) hashes
-- Created: 2026-01-15

-- Add server_computed column
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS server_computed BOOLEAN DEFAULT false;

-- Add index for auditing and filtering
CREATE INDEX IF NOT EXISTS idx_documents_server_computed ON documents(server_computed);

-- Update existing records (mark as untrusted since they used client-provided hashes)
UPDATE documents 
SET server_computed = false 
WHERE server_computed IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN documents.server_computed IS 
'TRUE if hash was computed by server from uploaded file bytes. FALSE if client-provided (UNTRUSTED). Only server-computed hashes should be used for notarization.';

-- Future enforcement (uncomment when all documents use server hash):
-- ALTER TABLE documents ADD CONSTRAINT enforce_server_hash CHECK (server_computed = true);
