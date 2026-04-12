---
description: Pre-Change System Audit Protocol
---

# BBSNS Pre-Change Audit Workflow

This workflow MUST be followed before applying any significant architectural change.

1. **System Audit**:
   - Audit `identity_state` consistency (DB vs BC).
   - Audit `storage_key` integrity (S3 check).
   - Audit `system_config` values (ENFORCE_KYC, etc).

2. **User State Audit**:
   - Count `ACTIVE`, `PENDING`, `REJECTED` users.
   - Verify no ongoing registrations or uploads.

3. **Logs Check**:
   - Scan `pm2 logs` for recent errors or warnings.
   - Check `logger.service.js` outputs on production.

4. **Dependency Check**:
   - Verify `package.json` consistency across local and production.
   - Trace affected files and their import/export chains.
