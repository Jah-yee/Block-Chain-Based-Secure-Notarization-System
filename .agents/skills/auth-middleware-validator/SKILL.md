---
name: auth-middleware-validator
description: Mandatory flow validation for all modifications to 'actor.js' (Auth Middleware).
---

# BBSNS Auth Middleware Validator

This skill MUST be invoked before any change to the `actor.js` file.

## 🔴 RULE_3: NO AUTH MIDDLEWARE CHANGE WITHOUT FLOW VALIDATION

**Targets**: `actor.js`

**Rule**: Any change MUST verify:
1. **Owner can access dashboard** (Verify login -> dashboard).
2. **Notary can access documents** (Verify login -> documents).
3. **Admin can manage users** (Verify login -> users).

**Failure risk**: Total system-wide lockout or data exposure.

**Action Plan**:
1. Perform local code audit.
2. Run unit tests for `actor.js`.
3. Perform end-to-end flow test for all three roles before push.
