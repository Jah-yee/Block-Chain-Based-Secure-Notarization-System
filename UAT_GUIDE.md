# BBSNS Cloud Architecture: User Acceptance Testing (UAT) Guide

This guide outlines end-to-end scenarios to verify that the BBSNS platform is production-ready, horizontally scalable, and monitorable.

## 1. Stateless Notarization & S3 Integration
**Goal**: Verify files are stored in S3 and move through the atomic state model.
1. **Action**: Upload a document via the Frontend.
2. **Action**: Log in as a Notary and "Approve" the document.
3. **Verification**:
   - Check the `documents` table: `storage_state` should be `STORED`, then `NOTARIZED`.
   - Check AWS S3 bucket: The file should exist in the bucket, not on the local server disk.
   - Check Logs: Look for `TASK_CLAIMED` and `TX_SENT` JSON entries.

## 2. Distributed Consistency (Auto-Recovery)
**Goal**: Verify the system can recover from a crash during a blockchain transaction.
1. **Action**: Start a Notarization.
2. **Action**: **Simulate Crash**: Stop the backend server immediately after the `TX_SENT` log appears (before confirmation).
3. **Action**: Restart the server and the `reconciliation-worker`.
4. **Verification**:
   - Check Logs: Look for the `SIGNAL_RECOVERY_TRIGGERED` event.
   - Result: The document should eventually move to `chain_confirmed = true` without user re-intervention.

## 3. Operational Intelligence & Traceability
**Goal**: Verify you can debug the system without reading code.
1. **Action**: Perform any notarization or identity sync.
2. **Action**: Copy the `correlation_id` from the API response headers (`X-Correlation-ID`).
3. **Action**: Search (grep) the logs for this ID.
4. **Verification**:
   - You should see a complete "story" of the request across the API and Workers.
   - Every log should show `previous_state` and `new_state`.

## 4. Emergency Operational Control (Kill Switch)
**Goal**: Verify you can stop worker processing instantly.
1. **Action**: Set `STOP_WORKERS=true` in your `.env` file.
2. **Action**: Restart the backend.
3. **Verification**:
   - Check Logs: You should see `WORKER_PAUSED` signals.
   - Result: No documents or users will be processed, even if they are pending.

## 5. Resilient RPC Fallback
**Goal**: Verify the system survives RPC provider outages.
1. **Action**: In `.env`, set the first URL in `BNB_RPC_URLS` to a broken or non-existent URL.
2. **Action**: Attempt a notarization.
3. **Verification**:
   - Check Logs: Look for retry attempts and eventually a successful connection via the fallback URL.
   - Result: The transaction should still succeed despite the first provider being down.

## 6. Distributed Rate Limiting
**Goal**: Verify traffic control works across instances.
1. **Action**: Rapidly attempt to log in with incorrect passwords multiple times.
2. **Verification**:
   - Result: You should receive a `429 Too Many Requests` error.
   - Scalability Check: This limit is shared globally in the database, so switching from `localhost:5000` to a second instance (if running) will still enforce the block.
