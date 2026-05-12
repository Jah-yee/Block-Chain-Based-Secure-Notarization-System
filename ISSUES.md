# BBSNS Tracking Issues - 2026-05-12

## [BUG-001] On-Chain Approval Reconciliation Stall
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Hardened `reconciliation-worker.js` logic and fixed the `idempotency_key` corruption.

## [BUG-002] Duplicate Action Buttons in Approved View
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Corrected backend status mapping. Action buttons now hide correctly in the Notary Dashboard.

## [BUG-003] Missing Initial NTK Minting on Notary Activation
**Status:** ✅ CLOSED (2026-05-08)
**Resolution:** Integrated `verifyAndProvisionInitialNTK` into `UserService.js` and `auth.js`. New Notaries now receive 100 NTK automatically.

## [BUG-004] Governance Privilege Leak (Notary Access to Admin Votes)
**Status:** ✅ CLOSED (2026-05-12)
**Resolution:** Fixed the SQL filter in `governance.js` to strictly enforce domain-based isolation for proposals.

## [BUG-006] Notary Authorization Deadlock (403 Forbidden)
**Status:** ✅ CLOSED (2026-05-12)
**Resolution:** Removed restrictive `tx_status` checks from `documents.js` to align with Identity Invariants. ACTIVE Notaries are no longer blocked by background sync delays.

## [BUG-007] Rejection Status Mapping Conflict
**Status:** ✅ CLOSED (2026-05-12)
**Resolution:** Fixed backend status derivation in `documents.js` and frontend handoff in `RequestDetails.tsx`. Rejections are now correctly identified and displayed throughout the workflow.
