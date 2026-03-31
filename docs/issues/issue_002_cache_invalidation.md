# ISSUE-002: RPC/Contract Mismatch (Cache Invalidation)

## Description
If the Desktop App caches its configuration locally (to survive API downtime) and the Backend updates a contract address (e.g., NotaryRegistry v2), the Frontend might continue using the stale address from its cache. This will result in valid signatures but rejected on-chain transactions.

## Impact
- Data corruption on-chain.
- User frustration due to silent failures.

## Proposed Resolution
- Add a `config_version` (integer) to the Backend database and API response.
- At launch, the Frontend must perform a "HEAD" request or similar to check if its cached version matches the Backend's version.
- If a mismatch is detected, ignore the cache and force a fresh fetch.
