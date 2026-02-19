const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('bbsns_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
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
      // @ts-ignore
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  async getMe() {
    const res = await this.request('/me');
    return res.user;
  },

  async getBalances() {
    return this.request('/api/tokens/balance');
  },

  async getDocuments() {
    return this.request('/api/documents');
  },

  async getDocument(id) {
    return this.request(`/api/documents/${id}`);
  },

  async getDocumentFile(id) {
    const token = localStorage.getItem('bbsns_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    // We can't use this.request because it returns JSON
    const response = await fetch(`${API_URL}/api/documents/${id}/file`, { headers });
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

  // --- GOVERNANCE ---
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

  baseUrl: API_URL,

  // --- NOTARY MANAGEMENT ---
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

  // --- MULTI-SIG EXECUTION ---
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

  // Remote Multi-Sig
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
  }
};

export default api;
