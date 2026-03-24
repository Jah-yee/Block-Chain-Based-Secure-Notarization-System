
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
}

async function apiRequest(endpoint: string, options: RequestOptions = {}) {
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
};
