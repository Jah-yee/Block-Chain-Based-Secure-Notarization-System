# BBSNS Tracking Issues - 2026-05-04

## [BUG-001] On-Chain Approval Reconciliation Stall
**Status:** Open
**Severity:** High
**Description:** Notary approvals are successfully signed and submitted to the blockchain (EIP-712 + recordAction), but the background `reconciliation-worker` still exhibits intermittent delays or stalls when updating the database from `submitted_to_blockchain` to `confirmed`.
**Suspected Cause:** Blockchain RPC latency or gas price fluctuations causing delayed finality.

## [BUG-002] Duplicate Action Buttons in Approved View
**Status:** Open
**Severity:** Medium
**Description:** In the Desktop Application (Notary Dashboard), when clicking the "View/Action" button for a document that is already in the "Approved" section, the user is still presented with the "Approve" and "Reject" buttons.
**Suspected Cause:** `RequestDetails.tsx` conditional rendering logic (Line 412) may not be correctly evaluating the `approved` status returned by the latest API mapping.
**Location:** `Frontend Desktop Application/src/components/notary/RequestDetails.tsx`
