---
name: storage-integrity-audit
description: Mandatory verification that no document is deleted after notarization without an archive record.
---

# BBSNS Storage Integrity Audit

This skill MUST be invoked before any automated or manual document removal.

## 🔴 RULE_5: STORAGE INTEGRITY RULE

**Rule**: Documents must NEVER be deleted after notarization unless explicitly archived.

**Failure risk**: Irreversible loss of notarized proof documents.

**Action Plan**:
1. Check `documents` database for `chain_confirmed = true`.
2. Verify document `storage_key` is not empty.
3. Ensure the file is not in a "transient" or "temporary" state.
4. If deletion is required, move to an `ARCHIVE` state first.
