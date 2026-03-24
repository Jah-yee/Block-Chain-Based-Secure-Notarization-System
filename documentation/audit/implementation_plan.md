# BBSNS Cloud Deployment Audit Plan

Objective: Verify if BBSNS is ready for a distributed, load-balanced cloud environment.

## Audit Strategy

### Phase 1: Statelessness & Local Dependencies
- **Research**: Examine `src/app.js` for session middleware configuration. Look for `express-session` without a DB store.
- **Research**: Check `src/routes/documents.js` (or similar) for `multer` configuration and file destination.
- **Impact**: Memory-based sessions or local file storage will break in a multi-instance (load-balanced) setup.

### Phase 2: Environment Isolation
- **Code Audit**: Search for hardcoded `localhost`, IP addresses, or secrets.
- **Dynamic Config**: Call `/api/system/config` to verify if the frontend consumes values exclusively from the backend.

### Phase 3: Distributed Workers & Consistency
- **Code Audit**: Inspect `src/workers/` for any locking mechanism (Redis locks, DB-based locks, or advisory locks).
- **Test**: Attempt to run two instances of a worker simultaneously and check for duplicate blockchain transactions or DB updates.

### Phase 4: Failure Resilience
- **Simulation**: Temporarily modify `.env` to an invalid `RPC_URL` and observe backend boot/runtime behavior.
- **Simulation**: Stop the local Postgres service (if possible) or use a script to drop DB connections.

### Phase 5: Concurrency
- **Test**: Use `scripts/test_signer_load.js` or custom scripts to fire 50+ parallel notarization requests.

## Deliverables
- A structured report following the strictly specified format for each test.
