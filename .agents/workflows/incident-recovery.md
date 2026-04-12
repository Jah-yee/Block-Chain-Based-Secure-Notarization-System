---
description: Emergency System Recovery Protocol
---

# BBSNS Incident Recovery Workflow

This workflow MUST be followed in the event of a production failure.

1. **Identify Error**:
   - Check `pm2 logs`.
   - Check `logger.service.js` outputs on production.
   - Run `grep -r "ERROR" ...` on relevant logs.

2. **Rollback Code**:
   - Revert to last stable commit.
   - Re-deploy stable code to production.

3. **Restore DB (if needed)**:
   - Identify last stable backup in `/home/ubuntu/backups/`.
   - Restore using `psql notarydb < backup.sql`.

4. **Restart Services**:
   - `pm2 reload all`.
   - Verify all processes are online.

5. **Validate Flows**:
   - Invoke `post-change-validation` workflow.
