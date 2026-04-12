---
name: safe-production-deploy
description: Mandatory local validation before any production deployment or service restart.
---

# BBSNS Safe Production Deploy

This skill MUST be invoked before any `pm2 restart`, `pm2 start`, or configuration deployment.

## 🔴 RULE_4: NO PRODUCTION DEPLOY WITHOUT LOCAL VALIDATION

**Rule**: Before executing a deployment to EC2:
1. **Backend must run locally** without runtime errors (`npm start`).
2. **Critical routes tested**: (Login, Register).

**Failure risk**: Production service crash or infinite restart loop.

**Action Plan**:
1. Run `npm run dev` or `npm start` locally.
2. Verify console logs for startup errors.
3. Test a probe request to `/api/health`.
4. Execute deployment script.
