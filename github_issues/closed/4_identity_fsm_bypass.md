---
title: "[P1] Enforce Identity Finite State Machine (UserService Bypass)"
labels: ["priority: P1", "category: identity-system", "category: authentication", "bug"]
---

**Category:** Identity System & Authentication
**Priority:** P1 - Core system integrity

### Description
Currently, Registration (`/register`) and Onboarding logic directly execute raw `INSERT INTO users (...) VALUES ('PENDING_KYC')` commands, bypassing the formalized `UserService.updateIdentityState()` architectural pattern entirely. Because this Service handles PostgreSQL triggers and auditable event hooks, newly onboarded users are improperly processed. Notary/Admin syncing produces `kyc_verified=true` alongside undefined `identity_state` values, causing fatal `[AUTH_DENY] Double-Lock Failure` crash-loops in the PM2 background worker.

### Acceptance Criteria
- `users.js` and `auth.js` exclusively rely on `UserService` abstraction modules to execute DB updates relating to state transitions.
- Registration workflows correctly flow through the FSM triggers.
- The stranded 5 `PENDING_KYC` existing users in production `notarydb` are systematically migrated or rejected without breaking chain connections.

### Technical Tasks
1. Refactor raw inserts in `routes/auth.js` (`/register`, `/genesis/onboard`, `/notary/onboard`, `/remote/authorize`).
2. Integrate `UserService.updateIdentityState()` logically.
3. Deploy a patching DB migration mapping existing locked users to their appropriate FSM node.

### Risks
High Risk. Touching authentication modules may temporarily break wallet Web3 logins while components align.

### Dependencies
- **Issue #3** (Isolating storage corruption minimizes overlapping breakage).
