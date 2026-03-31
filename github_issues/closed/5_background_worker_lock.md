---
title: "[P2] Background Worker Lock Starvation (`identity-sync.js`)"
labels: ["priority: P2", "category: document-lifecycle", "category: blockchain", "bug"]
---

**Category:** Blockchain Integration / Operations Job
**Priority:** P2 - Functional correctness

### Description
The PM2 stdout logs report chronic lock dropouts: `[LOCK] Error acquiring lock 1001: Connection terminated unexpectedly`. The Reconciliation worker drops its connections because its `client.release()` block or pooling timeouts are aggressively starvation-inducing, leading to stalled tasks.

### Acceptance Criteria
- `reconciliation` background queue successfully runs via lock isolation without dumping `Connection terminated` events to PM2.
- Orphaned tasks correctly recover via idempotency keys on retry.

### Technical Tasks
1. Investigate the polling structure inside `identity-sync.js` or backend PM2 tasks handling lock allocation.
2. Standardize connection pools and inject robust `try-catch-finally` boundaries to ensure `client.release()` acts universally regardless of upstream crashes. 

### Risks
Low consequence to live frontend routing.

### Dependencies
- **Issue #4** (The FSM dictates which users this worker sweeps).
