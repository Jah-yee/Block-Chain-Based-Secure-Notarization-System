-- Migration: Add note column to ntkr_transactions table for approval/rejection notes

ALTER TABLE ntkr_transactions ADD COLUMN IF NOT EXISTS note TEXT;
