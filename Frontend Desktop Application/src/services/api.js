let API_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.bbsns.online';
let configMode = 'LIVE';

// 🛡️ [RESILIENCE] Listen for Configuration Mode updates from ConfigAuthority
if (typeof window !== 'undefined') {
  window.addEventListener('bbs_config_loaded', (e) => {
    configMode = e.detail.mode;
    console.log(`[API] Resilience Mode: ${configMode}`);
  });
}

/**
 * 🛡️ DEPRECATED: ensureConfig()
 * Configuration is now handled authoritatively by ConfigAuthority context.
 */
async function ensureConfig() {
  return; 
}

const ROLE_MAP = {
  1: 'owner',
  2: 'notary',
  3: 'admin',
  'admin': 'admin',
  'notary': 'notary',
  'owner': 'owner'
};

const api = {
  baseUrl: API_URL,
  setBaseUrl(url) {
    this.baseUrl = url;
    console.log(`[API] Base URL updated to: ${url}`);
  },
  async request(endpoint, options = {}) {
    await ensureConfig();
    
    // 🛡️ [RESILIENCE] WRITE-GATING FOR STALE/DEGRADED MODES
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || 'GET');
    if (isWrite && configMode !== 'LIVE') {
        const msg = configMode === 'STALE' 
            ? 'Configuration outdated (>24h). Write operations are disabled until you synchronize.'
            : 'System is running in Offline/Degraded Mode. Write operations are disabled.';
            
        console.error(`[CONFIG_GATE] Blocked ${options.method} to ${endpoint} due to ${configMode} mode.`);
        const error = new Error(msg);
        error.status = 403;
        throw error;
    }

    if (typeof window !== 'undefined' && window.electronAPI?.api?.call) {
        const method = (options.method || 'GET').toUpperCase();
        console.log(`[API] Authoritative Bridge → ${method} ${endpoint}`);
        
        let data = null;
        if (options.body) {
            try {
                data = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            } catch (e) {
                data = options.body;
            }
        }

        // 🛡️ [SECURITY] Hardened Path: Bridge is now the ONLY authority.
        // No fallback to fetch() to ensure zero-trust logic remains consistent.
        const response = await window.electronAPI.api.call(endpoint, method, data);
        
        if (response.success) {
            return response.data;
        } else {
            console.error(`[API_BRIDGE_ERROR] ${endpoint}:`, response.error);
            const error = new Error(response.error?.message || "Bridge Communication Fault");
            error.status = response.error?.status || 500;
            error.data = response.error?.data;
            throw error;
        }
    }

    // 🛡️ [LEGACY] Fallback Path (localStorage)
    const token = localStorage.getItem('bbsns_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${api.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network response was not ok' }));
      let errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
      if (errorData.details) {
        errorMessage += ` | Details: ${errorData.details}`;
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  async getMe() {
    const res = await this.request('/api/auth/me');
    const user = res.user;
    if (user && user.role) {
      user.role = ROLE_MAP[user.role] || (typeof user.role === 'string' ? user.role.toLowerCase() : "");
    }
    return user;
  },

  async getBalances() {
    return this.request('/api/tokens/balance');
  },

  async getOnChainBalance(address, type = 'ntk') {
    return this.request(`/api/tokens/onchain/${type}/${address}`);
  },

  async getDocuments() {
    return this.request('/api/documents');
  },

  async getDocument(id) {
    return this.request(`/api/documents/${id}`);
  },

  async getDocumentFile(id) {
    await ensureConfig();
    const endpoint = `/api/documents/${id}/file`;

    // 🛡️ [SECURITY] Route through bridge if available (Mandatory Authority)
    if (typeof window !== 'undefined' && window.electronAPI?.api?.call) {
        return await window.electronAPI.api.call(endpoint, 'GET');
    }

    const token = localStorage.getItem('bbsns_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const response = await fetch(`${api.baseUrl}${endpoint}`, { headers });
    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }
    return response.blob();
  },

  async updateDocument(id, data) {
    return this.request(`/api/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async getUsers() {
    return this.request('/api/users');
  },

  async updateUser(id, data) {
    return this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async getProposals() {
    return this.request('/api/governance/proposals');
  },

  async createProposal(data) {
    return this.request('/api/governance/proposals', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async prepareProposalOnChain(id) {
    return this.request(`/api/governance/proposals/${id}/prepare-on-chain`, { method: 'POST' });
  },

  async submitProposalOnChain(id, signature) {
    return this.request(`/api/governance/proposals/${id}/submit-on-chain`, {
      method: 'POST',
      body: JSON.stringify({ signature })
    });
  },

  async voteOnProposal(proposalId, decision, signature, timestamp) {
    return this.request(`/api/governance/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ decision, signature, timestamp })
    });
  },

  async getGovernanceAlertCount() {
    return this.request('/api/governance/alerts/count');
  },

  async getNotaryApplications() {
    return this.request('/api/notaries/applications');
  },

  async getNotaries() {
    return this.request('/api/notaries');
  },

  async approveNotaryApplication(id) {
    return this.request(`/api/notaries/applications/${id}/approve`, { method: 'POST' });
  },

  async rejectNotaryApplication(id) {
    return this.request(`/api/notaries/applications/${id}/reject`, { method: 'POST' });
  },

  async resendNotaryActivation(id) {
    return this.request(`/api/notaries/applications/${id}/resend-activation`, { method: 'POST' });
  },

  async getMultiSigTransactions() {
    return this.request('/api/governance/multisig/transactions');
  },

  async getMultiSigSettings() {
    return this.request('/api/governance/multisig/settings');
  },

  async confirmMultiSigApprove(txIndex, signature) {
    return this.request(`/api/governance/proposals/0/confirm-on-chain`, {
      method: 'POST',
      body: JSON.stringify({ txIndex, signature })
    });
  },

  async executeMultiSigTransaction(txIndex) {
    return this.request(`/api/governance/multisig/transactions/${txIndex}/execute`, { method: 'POST' });
  },

  async revokeMultiSigConfirmation(txIndex) {
    return this.request(`/api/governance/multisig/transactions/${txIndex}/revoke`, { method: 'POST' });
  },

  async initRemoteMultiSigSession(txIndex) {
    return this.request('/api/governance/remote/multisig/session', {
      method: 'POST',
      body: JSON.stringify({ txIndex })
    });
  },

  async checkRemoteMultiSigStatus(sessionId) {
    return this.request(`/api/governance/remote/vote/status/${sessionId}`);
  },

  async getSystemLogs() {
    return this.request('/api/system/logs');
  },
  
  async getSignaturePayload(id, status, summary = "", reason = "") {
    let url = `/api/documents/${id}/signature-payload?status=${status}`;
    if (summary) url += `&summary=${encodeURIComponent(summary)}`;
    if (reason) url += `&reason=${encodeURIComponent(reason)}`;
    return this.request(url);
  },

  async getSystemConfig() {
    return this.request('/api/system/config');
  }
};

export default api;
