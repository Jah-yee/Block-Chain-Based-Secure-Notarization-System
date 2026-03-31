---
title: "[P0] Purge Critical Storage Bloat Causing 95% Disk Usage"
labels: ["priority: P0", "category: infrastructure", "bug"]
---

**Category:** Infrastructure
**Priority:** P0 - System breaking / data loss risk

### Description
The production EC2 server (`/`) is currently at 95% (7.2G/7.6G) capacity due to massive `.npm/_cacache` bloat (1.1G) and orphaned `.tar.gz` deployment artifacts (~500M). If capacity hits 100%, PostgreSQL will crash and data corruption may occur.

### Acceptance Criteria
- Free space on `/dev/root` is increased to at least 25% (2GB+).
- Stale deployment artifacts are removed.

### Technical Tasks
1. Connect via SSH to the production server.
2. Execute `npm cache clean --force` targeting the `ubuntu` user cache.
3. Remove stale `*.tar.gz` instances in `/home/ubuntu` except the latest active builds.

### Risks
Low. Removing log backups or caches does not impact live application logic.

### Dependencies
None. This is the blocking step for all subsequent database and code updates.
