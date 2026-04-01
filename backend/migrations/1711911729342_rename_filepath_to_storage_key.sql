-- ================================================================
-- Migration: 20260324_rename_filepath_to_storage_key.sql
-- Goal: Reflect cloud storage semantics by renaming filepath to storage_key
-- ================================================================

-- 1. Rename column and add state in upload_intents
ALTER TABLE upload_intents 
  RENAME COLUMN filepath TO storage_key;
ALTER TABLE upload_intents
  ADD COLUMN IF NOT EXISTS storage_state TEXT DEFAULT 'UPLOADED'
  CHECK (storage_state IN ('UPLOADED', 'STORED', 'NOTARIZED', 'DELETED'));

-- 2. Rename column and add state in documents
ALTER TABLE documents 
  RENAME COLUMN filepath TO storage_key;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_state TEXT DEFAULT 'STORED'
  CHECK (storage_state IN ('UPLOADED', 'STORED', 'NOTARIZED', 'DELETED'));
