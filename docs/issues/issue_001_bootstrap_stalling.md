# ISSUE-001: Bootstrap Stalling (Handshake Failure)

## Description
In the "Single Source of Truth" (SSoT) architecture, the Desktop App relies on a hardcoded `DEFAULT_API_URL` to fetch its runtime config on launch. If this URL is stale (e.g., after an IP rotation), the app will be unable to reach the Backend and will hang or crash.

## Impact
- All "Plug-and-Play" benefits are lost if the initial handshake fails.
- Users see a "System Protocol Error" with no way to fix it.

## Proposed Resolution
- Implement a **Manual Bootstrap Boundary**.
- If the initial config fetch fails after 3 attempts, show a UI prompt: "Could not find Network Authority. Please enter Backend IP address."
- Store the user-provided (or last successful) IP in `localStorage` as the new bootstrap URL.
