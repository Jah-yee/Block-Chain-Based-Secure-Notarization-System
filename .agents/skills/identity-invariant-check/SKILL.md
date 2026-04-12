---
name: identity-invariant-check
description: Mandatory verification that identity_state = ACTIVE ensures system access.
---

# BBSNS Identity Invariant Check

This skill MUST be invoked before any login, dashboard, or registration sync refactoring.

## 🔴 RULE_6: IDENTITY INVARIANT

**Rule**: If `identity_state = ACTIVE` → user MUST access system.

**Failure risk**: Broken onboarding or "Infinite Loading" dashboard login states.

**Action Plan**:
1. Check `actor.js` for role gate consistency.
2. Verify `identity_state` update logic in `UserService`.
3. Perform end-to-end flow test (Register -> Login -> Dashboard).
