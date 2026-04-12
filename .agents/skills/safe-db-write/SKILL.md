---
name: safe-db-write
description: Enforce backup-before-write policy for all state-modifying database operations (UPDATE, DELETE, ALTER).
---

# BBSNS Safe DB Write

This skill MUST be invoked before any destructive or structural database operation.

## 🔴 RULE_2: NO DIRECT DB WRITE WITHOUT BACKUP

**Rule**: Before any `UPDATE`, `DELETE`, or `ALTER` query on the production database:
1. You MUST run: `pg_dump -t target_table > /home/ubuntu/backups/backup_$(date +%F_%T).sql`
2. **Verify** the backup file path and size before proceeding.

**Failure risk**: Irreversible data corruption or loss.

**Action Plan**:
1. Check `/home/ubuntu/backups/` exists.
2. Run `pg_dump`.
3. Verify file size is non-zero.
4. Execute intended SQL modification.
