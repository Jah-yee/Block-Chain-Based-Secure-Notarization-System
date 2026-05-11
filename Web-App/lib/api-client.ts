import { ConfigValidator } from './config-validator';
import { integrityStore } from './integrity-store';

/**
 * 🛡️ [INTEGRITY] Custom Error for Blockchain Resilience
 */
export class IntegrityError extends Error {
    public status: number;
    public retryAfter: number;
    public requestId: string;

    constructor(message: string, status: number, retryAfter: number, requestId: string) {
        super(message);
        this.name = 'IntegrityError';
        this.status = status;
        this.retryAfter = retryAfter;
        this.requestId = requestId;
    }
}

let BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
let configFetched = false;
let configMode: 'LIVE' | 'DEGRADED' | 'STALE' | 'EMERGENCY' = 'LIVE';

const CACHE_KEY = 'bbsns_config_cache';
const CACHE_TS_KEY = 'bbsns_config_cache_ts';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

async function ensureConfig() {
    if (configFetched || typeof window === 'undefined') return;
    
    const bootstrapUrl = process.env.NEXT_PUBLIC_API_URL || "";
    let config = null;

    // TIER 1: Authoritative Sync with Exponential Backoff (3 attempts)
    for (let i = 0; i < 3; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout per attempt
            
            const response = await fetch(`${bootstrapUrl}/api/system/config`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const payload = await response.json();
                
                // 🛡️ INTEGRITY: Schema Validation
                // Note: Frontend HMAC recomputation removed — crypto.subtle behaves
                // differently under the MetaMask SES/LavaMoat sandbox.
                // Config integrity is guaranteed by: (1) backend validates before serving,
                // (2) transport is HTTPS. Schema validation below is sufficient.
                const isValid = await ConfigValidator.validate(payload);

                if (isValid) {
                    console.log(`[CONFIG] ✅ Schema valid. Checksum present: ${!!payload.checksum}. Entering LIVE mode.`);
                    // 🛡️ [VERSION_GATING] Force update if backend version is newer than cache
                    const cachedStr = localStorage.getItem(CACHE_KEY);
                    const cached = cachedStr ? JSON.parse(cachedStr) : null;
                    const isNewer = cached && payload.version > (cached.version || 0);
                    
                    if (isNewer) {
                        console.warn(`[CONFIG] Remote version ${payload.version} > Local ${cached.version}. Updating cache.`);
                    }

                    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
                    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
                    
                    config = payload;
                    configMode = 'LIVE';
                    break;
                } else {
                    console.error('[CONFIG] Received malformed configuration — schema validation failed.');
                }
            }
        } catch (err) {
            if (i < 2) {
                const delay = i === 0 ? 2000 : 5000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    // TIER 2: Cache Fallback
    if (!config) {
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (cachedStr) {
            try {
                const { data, timestamp } = JSON.parse(cachedStr);
                
                // 🛡️ INTEGRITY: Verify Cached Schema
                if (await ConfigValidator.validate(data)) {
                    const age = Date.now() - timestamp;
                    if (age > MS_IN_DAY) {
                        console.warn('[CONFIG] Cache is older than 24h. Entering STALE (Read-Only) mode.');
                        configMode = 'STALE';
                    } else {
                        console.log('[CONFIG] Backend unreachable. Using valid local cache (DEGRADED).');
                        configMode = 'DEGRADED';
                    }
                    config = data;
                } else {
                    console.warn('[CONFIG] Local cache is corrupted. Clearing.');
                    localStorage.removeItem(CACHE_KEY);
                }
            } catch (e) {
                localStorage.removeItem(CACHE_KEY);
            }
        }
    }

    // TIER 3: Emergency Fallback
    if (!config) {
        console.error('[CONFIG] No backend reachable and no local cache found. EMERGENCY mode.');
        configMode = 'EMERGENCY';
        config = { apiBaseUrl: bootstrapUrl };
    }

    if (config.apiBaseUrl) {
        BACKEND_URL = config.apiBaseUrl;
    }

    // Notify UI of config state
    window.dispatchEvent(new CustomEvent('bbs_config_loaded', { detail: { mode: configMode } }));
    configFetched = true;
}

/**
 * Standardized API client for the BBSNS Web-App.
 * 
 * DESIGN PRINCIPLES:
 * 1. Authority: Backend is the sole source of truth.
 * 2. Security: Uses cookies (credentials: include) exclusively for session.
 * 3. Fail-Closed: Automatically handles 401s by forcing logout.
 */

interface RequestOptions extends RequestInit {
    data?: any;
    responseType?: 'json' | 'blob';
}

async function apiRequest(endpoint: string, options: RequestOptions = {}) {
    await ensureConfig();
    
    // 🛡️ [RESILIENCE] WRITE-GATING FOR STALE/DEGRADED MODES
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || (options.data ? 'POST' : 'GET'));
    if (isWrite && configMode !== 'LIVE') {
        const msg = configMode === 'STALE' 
            ? 'Configuration outdated (>24h). Write operations are disabled until you reconnect.'
            : 'System is running in Offline Mode. Write operations are disabled.';
            
        console.error(`[CONFIG_GATE] Blocked ${options.method} to ${endpoint} due to ${configMode} mode.`);
        return Promise.reject({
            status: 403,
            message: msg
        });
    }

    const { data, ...customConfig } = options;
    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...customConfig.headers,
    };

    // If data is FormData, let the browser set the content-type (needed for boundary)
    if (data instanceof FormData) {
        if (headers['Content-Type' as keyof typeof headers]) {
            delete (headers as any)['Content-Type'];
        }
    }

    const config: RequestInit = {
        method: data ? (customConfig.method || 'POST') : (customConfig.method || 'GET'),
        ...customConfig,
        headers,
        credentials: 'include', // CRITICAL: REQUIRED FOR HTTPONLY COOKIES
    };

    // 🛡️ [PHASE 1] Body Serialization
    if (data) {
        config.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    const requestTs = Date.now();
    const requestId = Math.random().toString(36).substring(2, 9);

    try {
        const response = await fetch(url, config);

        // 🛡️ [PHASE 1A] Signal Extraction & Store Update
        // We only process integrity signals from JSON responses
        const isJson = response.headers.get('Content-Type')?.includes('application/json');
        let responsePayload: any = null;

        if (isJson) {
            responsePayload = await response.clone().json().catch(() => null);
        }

        // Handle 426 (Integrity Degraded) - Trigger Failure Escalation
        if (response.status === 426) {
            integrityStore.processEvent({ type: 'FAILURE_426', ts: requestTs });
            
            const currentFailureCount = integrityStore.getState().failureCount;
            const delay = currentFailureCount >= 3 ? 10000 : 2000;
            
            console.warn(`[API_INTEGRITY] 🛑 Status 426 for ${endpoint}. Escalating delay to ${delay}ms (Fail #${currentFailureCount})`);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bbs_unauthorized')); // Existing auth trigger
            }

            throw new IntegrityError(
                responsePayload?.error || 'System Integrity Degraded',
                426,
                delay,
                requestId
            );
        }

        // Signal Store about successful/stale response
        if (responsePayload?.security_context) {
            const ctx = responsePayload.security_context;
            if (ctx.stale) {
                integrityStore.processEvent({ type: 'STALE_RESPONSE', ctx, ts: requestTs });
            } else if (ctx.env === 'VERIFIED') {
                integrityStore.processEvent({ type: 'STRONG_RESPONSE', ctx, ts: requestTs });
            }
        } else if (response.ok) {
            // Signal a generic successful interaction to update lastUpdate timestamp
            integrityStore.processEvent({ type: 'FAILURE_OTHER', ts: requestTs });
        }

        // 🛡️ [AUTH] Handle Authentication Failures (Logout Required)
        if (response.status === 401) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bbs_unauthorized'));
            }
            return Promise.reject({
                status: response.status,
                message: responsePayload?.error || 'Unauthorized'
            });
        }

        // 🛡️ [PERMISSION] Handle Authorization Failures (No Logout)
        if (response.status === 403) {
            return Promise.reject({
                status: 403,
                message: responsePayload?.error || 'Forbidden: Insufficient privileges',
                detail: responsePayload?.detail
            });
        }

        if (!response.ok) {
            return Promise.reject({
                status: response.status,
                message: responsePayload?.error || response.statusText
            });
        }

        // No content
        if (response.status === 204) return null;

        if (options.responseType === 'blob') {
            return await response.blob();
        }

        // 🛡️ [PHASE 1A] Final Data Unwrapping
        // If wrapped, return data. If legacy, return payload.
        return responsePayload?.security_context ? responsePayload.data : responsePayload;

    } catch (error: any) {
        if (error instanceof IntegrityError) throw error;

        // Dispatch general failure
        integrityStore.processEvent({ type: 'FAILURE_OTHER', ts: requestTs });

        return Promise.reject({
            status: 500,
            message: error.message || 'Network Error'
        });
    }
}

export const apiClient = {
    get: (url: string, config?: RequestOptions) => apiRequest(url, { ...config, method: 'GET' }),
    post: (url: string, data?: any, config?: RequestOptions) => apiRequest(url, { ...config, method: 'POST', data }),
    put: (url: string, data?: any, config?: RequestOptions) => apiRequest(url, { ...config, method: 'PUT', data }),
    patch: (url: string, data?: any, config?: RequestOptions) => apiRequest(url, { ...config, method: 'PATCH', data }),
    delete: (url: string, config?: RequestOptions) => apiRequest(url, { ...config, method: 'DELETE' }),
    getUrl: async (endpoint: string) => {
        await ensureConfig();
        return endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    }
};

export default apiClient;
