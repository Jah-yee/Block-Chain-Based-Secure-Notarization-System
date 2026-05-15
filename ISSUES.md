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
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** Removed `height: 100%` from `.flex-1.overflow-y-auto` rule in `globals.css`. Added `overflow-y: auto` to `.custom-scrollbar` class. Removed `overflow-hidden` from outer `<main>` in `App.tsx`.

## [BUG-009] MultiSig Transaction Dialog Hardcoded/Missing Data
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** Rewrote `/multisig/transactions` backend route to perform on-chain enrichment — now queries `to`, `value`, `data` from contract's `getTransaction()`, and fetches `confirmations[]` per signer via `isConfirmed()`. Root response now includes `address`, `threshold`, `timelockDelay`.

## [BUG-010] Timelock Delay Syncing Loop
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** `api.getMultisigSettings()` now calls `/multisig/stats` (the canonical endpoint that includes `timelockDelay`) instead of `/multisig/settings`. Also patched `/multisig/settings` to call `contract.timelockDelay()` in parallel and include it in all responses.

## [BUG-011] Governance Section Layout & Proposal Table Mismatch
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** Changed `GovernanceHealthWidget` grid breakpoint from `md:` to `sm:`. Wrapped proposals list in a `max-h-[400px] overflow-y-auto custom-scrollbar` scroll zone with a sticky header row. Increased title `max-w` from `200px` to `300px`.

## [BUG-012] Single-Admin Proposal Approval Execution Failure
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** (1) On-chain submission now uses `CASE WHEN status='passed' THEN 'passed'` to prevent overwriting fast-track status. (2) Remote vote threshold check fixed from `'admin'` string to `ROLES.ADMIN` constant. (3) Remote vote authorize response now returns `proposalPassed: true` and `status: 'passed'` for UI to react immediately.

## [BUG-013] ManageNotaries "Promote On-Chain" Button Case-Sensitivity
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** Fixed `status === "approved"` to `status === "APPROVED"` in `ManageNotaries.tsx` line 496 to match the normalized uppercase value returned by `normalizeStatus()`.

## [BUG-014] MultiSig Remote Confirmation Handshake Failure
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** (1) Fixed `initRemoteMultiSigSession` to call `/remote/confirm/session` (the existing correct endpoint). (2) Fixed `checkRemoteMultiSigStatus` to poll `/remote/confirm/status/:id`. (3) Removed broken `confirmMultiSigApprove` hardcoded to proposal `0`. (4) Fixed remote-sign URL to `/governance/remote-sign?sessionId=...`. (5) Updated `remote-sign/page.tsx` to discover session type by trying all three endpoints and added CONFIRM handling branch.

## [BUG-015] Governance `isSingleAdmin` False Positive Loop
**Status:** ✅ CLOSED (2026-05-15)
**Resolution:** `isSingleAdmin` now preferentially uses `adminCount` (DB truth) returned from the backend, which was added to both `/multisig/settings` and `/multisig/stats` responses. Falls back to on-chain signer count only if `adminCount` is unavailable.


