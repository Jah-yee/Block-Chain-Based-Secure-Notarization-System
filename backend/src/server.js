require('dotenv').config();
const app = require('./app.js');


const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

    if (process.env.NODE_ENV !== 'test') {
        // Reconciliation worker: now decoupled and running as a standalone PM2 worker.
    }
});
