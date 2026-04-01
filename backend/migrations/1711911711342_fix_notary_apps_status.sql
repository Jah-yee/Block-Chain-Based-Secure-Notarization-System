-- Migration: Update notary_applications status constraint
-- Purpose: Allow 'APPLIED' and 'KYC_VERIFIED' states used in the backend
-- Created: 2026-01-24

ALTER TABLE notary_applications DROP CONSTRAINT IF EXISTS notary_applications_status_check;

ALTER TABLE notary_applications 
ADD CONSTRAINT notary_applications_status_check 
CHECK (status IN ('pending', 'APPLIED', 'KYC_VERIFIED', 'approved', 'rejected'));

-- Ensure current rows are valid (though they should be)
UPDATE notary_applications SET status = 'APPLIED' WHERE status = 'pending';
