---
name: worker-impact-check
description: Mandatory evaluation of background worker changes on system responsiveness and locks.
---

# BBSNS Worker Impact Check

This skill MUST be invoked before any modification to `reconciliation-worker.js`, `cleanup-worker.js`, or any background processing logic.

## 🔴 RULE_7: WORKER NON-BLOCKING RULE

**Rule**: Workers must NEVER block:
1. **login** (Account access)
2. **dashboard** (Main UI availability)
3. **document upload** (Critical user flow)

**Failure risk**: Hidden system deadlocks and total API unresponsiveness.

**Action Plan**:
1. Identify all DB tables the worker modifies.
2. Verify query isolation (use `SKIP LOCKED` or short transaction windows).
3. Ensure the worker does not mutate `identity_state` for users who are already `ACTIVE`.
4. Test for table locks under simulated API load.
