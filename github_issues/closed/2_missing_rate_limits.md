---
title: "[P0] Restore Missing `rate_limits` Database Schema"
labels: ["priority: P0", "category: database", "category: authentication", "bug"]
---

**Category:** Database & Authentication
**Priority:** P0 - System breaking / function missing

### Description
The backend PM2 worker loop is frequently crashing with `[RATE_LIMITER_ERROR] relation "rate_limits" does not exist`. Because this table was skipped during migrations, all brute-force protections on critical `/auth` web3 endpoints are effectively disabled or falsely throwing 500 errors.

### Acceptance Criteria
- `rate_limits` table is successfully created in the `notarydb` database.
- PM2 application logs no longer report missing PostgreSQL relation errors for rate limiters.
- Rate limiting middleware correctly enforces IP/Wallet cooldown sequences.

### Technical Tasks
1. Generate the expected table schema for the `rate_limits` utility.
2. Execute the migration on the remote `notarydb` using the `postgres` system user via `psql`.

### Risks
Medium. Standard DDL operations. No data drops required.

### Dependencies
- **Issue #1** (Server must have sufficient disk space to safely write the postgres WAL without corruption).
