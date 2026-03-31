import { ConfigValidator } from './config-validator';

let BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
let configFetched = false;
let configMode: 'LIVE' | 'DEGRADED' | 'STALE' | 'EMERGENCY' = 'LIVE';

const CACHE_KEY = 'bbsns_config_cache';
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
                
                // 🛡️ INTEGRITY: Verify Schema & Checksum
                const isValid = await ConfigValidator.validate(payload);
                const isIntact = await ConfigValidator.verifyChecksum(payload, payload.checksum);

                if (isValid && isIntact) {
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
                    console.error('[CONFIG] Received malformed or corrupted configuration authority.');
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

    if (data) {
        config.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    try {
        const response = await fetch(url, config);

        if (response.status === 401 || response.status === 426) {
            const errorData = await response.json().catch(() => ({}));
            // Force logout on unauthorized
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('bbs_unauthorized'));
            }
            return Promise.reject({
                status: 401,
                message: errorData.error || 'Unauthorized'
            });
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return Promise.reject({
                status: response.status,
                message: errorData.error || response.statusText
            });
        }

        // No content
        if (response.status === 204) return null;

        if (options.responseType === 'blob') {
            return await response.blob();
        }

        return await response.json();
    } catch (error: any) {
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
