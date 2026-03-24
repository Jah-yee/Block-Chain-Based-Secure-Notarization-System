const pool = require('../db/index');
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

// Winston Transports for File Rotation
const fileTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info'
});

const errorTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'error'
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        fileTransport,
        errorTransport,
        new winston.transports.Console({
            format: winston.format.simple(),
        })
    ],
});

/**
 * System Logger — writes audit entries to system_logs table and rotated files.
 * All actions are logged fire-and-forget (never blocks the response).
 */
function logAction(action, message, source, metadata = {}) {
    const level = action.includes('FAIL') || action.includes('ERROR') || action.includes('REJECT') ? 'error' : 'info';
    const meta = { action, ...metadata };

    // 1. Log to Winston (Files + Console)
    logger.log(level, `${action}: ${message}`, { source, ...meta });

    // 2. Log to Database (System Audit)
    pool.query(
        'INSERT INTO system_logs (level, message, source, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [level, message, source || 'system', JSON.stringify(meta)]
    ).catch(err => console.error('[LOGGER] Failed to write to DB:', err.message));
}

module.exports = { logAction, logger };
