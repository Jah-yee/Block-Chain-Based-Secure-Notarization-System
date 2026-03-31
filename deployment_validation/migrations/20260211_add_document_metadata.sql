-- Add metadata columns for notary approval/rejection details
-- Created: 2026-02-11

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS notary_notes TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS document_summary TEXT;

-- Add comments for documentation
COMMENT ON COLUMN documents.notary_notes IS 'Notes and document summary provided by notary during approval';
COMMENT ON COLUMN documents.rejection_reason IS 'Reason provided by notary when rejecting a document';
COMMENT ON COLUMN documents.document_summary IS 'Summary of important document contents filled by notary';
