---
description: Post-Change Verification Protocol
---

# BBSNS Post-Change Validation Workflow

This workflow MUST be followed after any production deployment or system change.

1. **API Test**:
   - Verify `/api/health`.
   - Verify `/api/tokens/balance`.

2. **Owner Login Test**:
   - Register a user or login existing `ACTIVE` owner.
   - Verify Dashboard data loading.

3. **Notary Access Test**:
   - Login as `NOTARY`.
   - Verify Documents page access.

4. **Admin Panel Test**:
   - Login as `ADMIN`.
   - Verify Users page access and role management.

5. **Upload Test**:
   - Initiate a document upload.
   - Verify "Payment Required" or "Syncing" status.
