---
title: "[P1] Patch Persistent Document Storage Leak (Commented Expiry Logic)"
labels: ["priority: P1", "category: document-lifecycle", "bug"]
---

**Category:** Document Lifecycle
**Priority:** P1 - Core system integrity

### Description
In `backend/src/routes/documents.js`, orphaned file uploads are never purged from the disk/S3. The native garbage-collection code in Guard 3 of `POST /confirm` explicitly testing `if (new Date(intent.expires_at) < new Date())` is entirely commented out. Furthermore, there is no cron job sweeping abandoned `upload_intents`. An attacker or normal user dropping off mid-transaction permanently abandons the file on the server's drive.

### Acceptance Criteria
- `documents.js` uncommented and properly validates intent expiry during confirmation attempts, aggressively unlinking orphaned files via `fs.unlinkSync()`.
- A background PM2 or Node cron script is introduced into the worker suite to poll `upload_intents` where `expires_at < NOW()`, cleaning DB records and physically releasing storage resources.

### Technical Tasks
1. Uncomment the physical filesystem purge logic in `/confirm`.
2. Implement an automated sweeping worker inside `identity-sync.js` or a new cron worker specifically to clean intents older than a defined threshold.
3. Test upload bounds and intent removal natively.

### Risks
High risk of catastrophic data loss if the query targeting expired intents is misconfigured, accidentally deleting files belonging to active or verified user flows over the blockchain.

### Dependencies
- **Issue #2** (API must be stable under limits before modifying primary data transactions).
