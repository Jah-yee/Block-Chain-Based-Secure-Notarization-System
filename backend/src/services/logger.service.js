/**
 * Logger Service - Phase 7: Actionable Operational Intelligence
 * 
 * Provides structured JSON logging with strict enforcement of:
 * 1. State Transitions (previous_state -> new_state)
 * 2. Performance Tracking (duration_ms)
 * 3. Error Classification (Enums for TYPE and STAGE)
 */

const LOG_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL'
};

const ERROR_TYPES = {
    RPC: 'RPC_ERROR',
    CONTRACT: 'CONTRACT_ERROR',
    DB: 'DB_ERROR',
    AUTH: 'AUTH_ERROR',
    STORAGE: 'STORAGE_ERROR'
};

const ERROR_STAGES = {
    CLAIM: 'CLAIM',
    PRE_FLIGHT: 'PRE_FLIGHT',
    SEND: 'TX_SEND',
    CONFIRMATION: 'CONFIRMATION',
    RECOVERY: 'RECOVERY',
    CLEANUP: 'CLEANUP'
};

const SIGNALS = {
    TASK_STUCK: 'TASK_STUCK',
    HIGH_RETRY_COUNT: 'HIGH_RETRY_COUNT',
    RPC_FAILURE_SPIKE: 'RPC_FAILURE_SPIKE',
    DUPLICATE_PREVENTED: 'DUPLICATE_PREVENTED',
    RECOVERY_TRIGGERED: 'RECOVERY_TRIGGERED'
};

class Logger {
    constructor(workerName = 'API') {
        this.workerName = workerName;
    }

    /**
     * Internal log formatter with strict validation and PII Masking
     */
    _log(level, event, data = {}) {
        // 🛡️ PII Masking Policy (Zero-Trust)
        const mask = (val) => {
            if (typeof val !== 'string') return val;
            if (val.length <= 8) return '****';
            return val.substring(0, 6) + '...' + val.substring(val.length - 4);
        };

        const sensitiveFields = ['email', 'wallet_address', 'password_hash', 'notary_pin_hash', 'private_key', 'national_id_hash', 'phone'];
        const sanitizedData = { ...data };
        
        for (const field of sensitiveFields) {
            if (sanitizedData[field]) {
                sanitizedData[field] = mask(sanitizedData[field]);
            }
        }

        // Lifecycle Event Validation: Must include states
        const lifecycleEvents = ['TASK_CLAIMED', 'TX_SENT', 'TX_CONFIRMED', 'TX_FAILED', 'TASK_RECOVERED'];
        if (lifecycleEvents.includes(event)) {
            if (sanitizedData.previous_state === undefined || sanitizedData.new_state === undefined) {
                console.error(`[LOGGER_WARNING] Missing state transition for lifecycle event: ${event}`);
            }
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            worker: this.workerName,
            event: event,
            correlation_id: sanitizedData.correlation_id || 'root',
            entity_id: sanitizedData.entity_id || sanitizedData.id || null,
            tx_hash: sanitizedData.tx_hash || null,
            duration_ms: sanitizedData.duration_ms || null,
            previous_state: sanitizedData.previous_state || null,
            new_state: sanitizedData.new_state || null,
            message: sanitizedData.message || '',
            ...sanitizedData
        };

        // Remove redundant/aliased fields to keep logs clean
        delete logEntry.id;

        console.log(JSON.stringify(logEntry));
    }

    info(event, data) {
        this._log(LOG_LEVELS.INFO, event, data);
    }

    warn(event, data) {
        this._log(LOG_LEVELS.WARN, event, data);
    }

    /**
     * Structured Error Logging with Enums
     */
    error(event, data, error) {
        const errorData = {
            ...data,
            error_type: data.error_type || 'UNKNOWN',
            error_stage: data.error_stage || 'UNKNOWN',
            message: error ? error.message : data.message,
            stack: error ? error.stack : null,
        };

        // Strict Enum Validation for Errors
        if (!Object.values(ERROR_TYPES).includes(errorData.error_type)) {
            console.error(`[LOGGER_WARNING] Invalid error_type logged: ${errorData.error_type}`);
        }
        if (!Object.values(ERROR_STAGES).includes(errorData.error_stage)) {
            console.error(`[LOGGER_WARNING] Invalid error_stage logged: ${errorData.error_stage}`);
        }

        // Auto-escalation Logic
        let level = LOG_LEVELS.ERROR;
        if ((data.retry_count && data.retry_count > 5) || data.critical) {
            level = LOG_LEVELS.CRITICAL;
        }

        this._log(level, event, errorData);
    }

    /**
     * High-Value Signal Events (Triggers Action)
     */
    signal(signalName, data) {
        if (!SIGNALS[signalName]) {
            console.error(`[LOGGER_WARNING] Invalid signalName logged: ${signalName}`);
        }
        this._log(LOG_LEVELS.CRITICAL, `SIGNAL_${signalName}`, {
            ...data,
            is_signal: true
        });
    }

    /**
     * Enhanced Heartbeat with Backlog Metrics
     */
    heartbeat(metrics) {
        // Expected metrics: pending_count, processing_count, failed_count
        this._log(LOG_LEVELS.INFO, 'WORKER_HEARTBEAT', metrics);
    }
}

module.exports = {
    Logger,
    LOG_LEVELS,
    ERROR_TYPES,
    ERROR_STAGES,
    SIGNALS
};
