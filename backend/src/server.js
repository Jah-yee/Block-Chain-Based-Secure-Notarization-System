const app = require('./app.js');
const { reconcile } = require('./workers/reconciliation');
const { runIntentCleanup } = require('./workers/intent-cleanup-worker');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  if (process.env.NODE_ENV !== 'test') {
    // Reconciliation worker: re-check blockchain state for submitted docs
    reconcile();
    setInterval(reconcile, 5 * 60 * 1000);

    // Intent cleanup worker: expire stale upload intents, delete temp files
    runIntentCleanup();
    setInterval(runIntentCleanup, 5 * 60 * 1000);
  }
});

