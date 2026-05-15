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

---

# New Audit Findings - 2026-05-15

## [BUG-008] Global UI Scrolling Failure (Desktop App)
**Status:** 🔴 OPEN
**Findings:** 
1. `overflow-hidden` on outer `<main>` clips all content.
2. `.custom-scrollbar` missing `overflow-y: auto`.
3. `.flex-1.overflow-y-auto` forces `height: 100%`, killing scroll context.

## [BUG-009] MultiSig Transaction Dialog Hardcoded/Missing Data
**Status:** 🔴 OPEN
**Findings:** Backend `/multisig/transactions` is a DB stub. Fields `to`, `value`, `data`, and `confirmations[]` are missing, leading to epoch dates and blank fields in UI.

## [BUG-010] Timelock Delay Syncing Loop
**Status:** 🔴 OPEN
**Findings:** Frontend calls `/multisig/settings` which lacks `timelockDelay`. The health widget is stuck in an infinite "Syncing Delay..." state.

## [BUG-011] Governance Section Layout & Proposal Table Mismatch
**Status:** 🔴 OPEN
**Findings:** Health cards squish in grid; proposals list has no scroll boundary or structured table format.

## [BUG-012] Single-Admin Proposal Approval Execution Failure
**Status:** 🔴 OPEN
**Findings:** 
1. Status `passed` overwritten to `active` during on-chain submission.
2. Remote vote threshold check uses wrong role type (string vs number).
3. Auto-execution banner is misleading; execution remains manual.

## [BUG-013] ManageNotaries "Promote On-Chain" Button Case-Sensitivity
**Status:** 🔴 OPEN
**Findings:** Case mismatch between `APPROVED` (normalized) and `approved` (checked in JSX) prevents button display in table.

## [BUG-014] MultiSig Remote Confirmation Handshake Failure
**Status:** 🔴 OPEN
**Findings:** 
1. `initRemoteMultiSigSession` calls non-existent endpoint.
2. Status polling calls vote endpoint instead of confirm endpoint.
3. API call uses hardcoded proposal ID `0`.

## [BUG-015] Governance `isSingleAdmin` False Positive Loop
**Status:** 🔴 OPEN
**Findings:** Logic uses on-chain signer count instead of DB admin count, causing UI divergence and misleading enforcement banners.

