-- Migration to update proposal_type ENUM
ALTER TYPE proposal_type ADD VALUE IF NOT EXISTS 'add_admin';
ALTER TYPE proposal_type ADD VALUE IF NOT EXISTS 'remove_admin';
