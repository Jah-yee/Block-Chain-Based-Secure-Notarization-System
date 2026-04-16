require('dotenv').config();
const db = require('./db/index.js');
const storage = require('./services/storage.service.js');

try {
    db.init();
    storage.init();
    console.log("S3 CLIENT INITIALIZED");
} catch (err) {
    console.error("❌ FATAL ERROR DURING STORAGE INITIALIZATION:", err.message);
    process.exit(1);
}

// Ensure routes are registered ONLY after initialization passes
const app = require('./app.js');
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

    if (process.env.NODE_ENV !== 'test') {
        // Reconciliation worker: now decoupled and running as a standalone PM2 worker.
    }
});
