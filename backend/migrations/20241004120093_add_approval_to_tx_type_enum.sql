-- Migration: Add 'approval' to tx_type_enum for approval/rejection transactions

ALTER TYPE tx_type_enum ADD VALUE 'approval';
