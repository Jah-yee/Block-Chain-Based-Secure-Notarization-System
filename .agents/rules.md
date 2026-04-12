# BBSNS System Invariants (The Truth Layer)

These are the non-breakable rules and high-level truths that govern every operation within the BBSNS ecosystem.

---

## 🔒 1. IDENTITY INVARIANT
- **ACTIVE user = usable system**: If a user's `identity_state` is `ACTIVE` in the database, they MUST have full access to their dashboard and notarization features. No background dependencies (like blockchain sync) should block this.
- **REJECTED user = blocked**: Any user with `identity_state = REJECTED` or `DEACTIVATED` MUST be immediately fail-closed and blocked from all authenticated routes.

## 🔒 2. STORAGE INVARIANT
- **Persistence**: Every uploaded document MUST exist until manually deleted or explicitly move to a documented long-term `ARCHIVE` state.
- **No Transit-Only S3**: S3 is an authoritative store, not a temporary transit area.

## 🔒 3. ACCESS CONTROL INVARIANT
- **OWNER**: Can `upload` and `view` their own documents.
- **NOTARY**: Can `verify` and `approve` documents assigned to them.
- **ADMIN**: Can `manage system`, users, and global configuration.
- **Fail-Closed**: If a role is missing or invalid, access is denied by default.

## 🔒 4. BLOCKCHAIN INVARIANT
- **Blockchain = proof**: The on-chain state is the final source of Truth for notarization records and audit trails.
- **NOT real-time gate (for MVP)**: On-chain role sync and transaction finality are asynchronous. They must NOT block the user from registering, logging in, or initiating uploads.

## 🔒 5. DEPLOYMENT INVARIANT
- **Verified Path Authority**: BEFORE any file transfer (`scp`) or service command (`pm2`), the active production directory MUST be verified by checking the `cwd` of the running process (`ps aux` or `pm2 info`).
- **Zero Pollution**: Never create new directories or redundant path variations (e.g., `BBSNS_v2`) on the production instance without explicit user instructions.
- **Fail-Safe Verify**: Every deployment MUST be followed by a health-check verification (`curl`) to the active backend endpoint.

---


## 🧠 THE GROUND RULE
**Before every operation, evaluate impact on all invariants.**
If a proposed change violates any of the abovetruths, it is an invalid operation.
