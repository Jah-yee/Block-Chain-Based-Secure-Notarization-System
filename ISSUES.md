# BBSNS Tracking Issues - 2026-05-05

## [BUG-001] On-Chain Approval Reconciliation Stall
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Hardened `reconciliation-worker.js` logic and fixed the `idempotency_key` corruption in `documents.js`. Verified that confirmed transactions now sync within one block cycle.

## [BUG-002] Duplicate Action Buttons in Approved View
**Status:** ✅ CLOSED (2026-05-05)
**Resolution:** Corrected backend status mapping in `documents.js`. The `status` field now returns `approved` for blockchain-submitted documents, which correctly triggers the conditional rendering logic in `RequestDetails.tsx` to hide the action buttons.

## [BUG-003] Missing Initial NTK Minting on Notary Activation
**Status:** 🔴 OPEN
**Severity:** High
**Description:** New Notaries are successfully activated in the database and on-chain, but they start with a 0.0 NTK balance. They are currently forced to wait for the daily background worker to run before they can perform their first notarization.
**Required Fix:** Integrate a "Welcome Mint" trigger in `UserService.js` and the Notary Onboarding route to instantly credit new accounts.
