-- Migration to add targeting to governance proposals
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS target_notaries JSONB DEFAULT '[]';
