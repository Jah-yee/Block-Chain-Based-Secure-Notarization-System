-- Migration: 20260223_extend_transaction_enum.sql
-- Goal: Support the new transactional lifecycle statuses for NTKR transactions.

ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'skipped';
