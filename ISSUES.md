# BBSNS Tracking Issues - 2026-05-05

## [BUG-001] On-Chain Approval Reconciliation Stall
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Hardened `reconciliation-worker.js` logic and fixed the `idempotency_key` corruption.

## [BUG-002] Duplicate Action Buttons in Approved View
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Corrected backend status mapping. Action buttons now hide correctly in the Notary Dashboard.

## [BUG-003] Missing Initial NTK Minting on Notary Activation
**Status:** 🔴 OPEN
**Severity:** High
**Description:** New Notaries start with 0.0 NTK. Need to integrate "Welcome Mint" in `UserService.js`.

## [BUG-004] Governance Privilege Leak (Notary Access to Admin Votes)
**Status:** 🔴 OPEN
**Severity:** Critical (Security)
**Description:** Notaries can view Admin-only proposals due to a logic flaw in the SQL filter.

## [BUG-005] NotaryRegistry Protocol Conflict (Not Governance)
**Status:** 🔴 OPEN
**Severity:** High
**Description:** Direct promotion of notaries fails because the contract requires a Governance Proposal.
**Implemented Fix (Phase 1):** Added Real-time Blockchain Audit (Red/Green dots) to identify unsynced users and added a "Promote" bridge to the details view.
