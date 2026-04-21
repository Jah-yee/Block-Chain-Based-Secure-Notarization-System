const fs = require('fs');
const path = require('path');

/**
 * 🛡️ STATE INTEGRITY AUDIT (BBSNS BUNKER V3.8)
 * Responsibility: Prevent regressions by blocking any raw SQL mutations to document state.
 * Enforcement: Scans target files for 'UPDATE documents SET submission_state'.
 * Rule: All state transitions MUST flow through 'DocumentStatusService'.
 */

const targetFile = path.resolve(__dirname, '../src/routes/documents.js');
// Regex matches raw SQL updates to submission_state
const rawUpdateRegex = /UPDATE\s+documents\s+SET\s+submission_state/gi;

function runAudit() {
    console.log(`[AUDIT] Starting integrity scan for: ${targetFile}`);
    
    if (!fs.existsSync(targetFile)) {
        console.error(`[AUDIT_ERROR] Target file not found: ${targetFile}`);
        process.exit(1);
    }

    const content = fs.readFileSync(targetFile, 'utf8');
    const matches = content.match(rawUpdateRegex);

    if (matches && matches.length > 0) {
        console.error('---------------------------------------------------------');
        console.error(`[AUDIT_FAILED] FOUND ${matches.length} ILLEGAL RAW STATE UPDATES!`);
        console.error('All state mutations MUST use DocumentStatusService.updateStatus().');
        console.error('---------------------------------------------------------');
        process.exit(1);
    }

    // Secondary check: ensure DocumentStatusService is actually imported
    if (!content.includes('DocumentStatusService')) {
        console.error('[AUDIT_FAILED] DocumentStatusService import is missing in target file.');
        process.exit(1);
    }

    console.log('[AUDIT_PASSED] Logic Lockdown verified. No raw state leaks detected.');
    process.exit(0);
}

runAudit();
