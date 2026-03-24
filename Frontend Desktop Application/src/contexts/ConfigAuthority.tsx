import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

/**
 * 🛡️ CONFIG AUTHORITY CONTEXT
 * Responsibility: Single solicitor of authoritative configuration from the Backend.
 * Rules:
 * - Fail-Closed: Blocks app if backend is inconsistent or unreachable.
 * - Dynamic: Version-aware re-initialization.
 * - Actionable: Provides structured error codes for UI feedback.
 */

export interface SystemConfig {
  rpcUrl: string;
  chainId: number;
  contracts: {
    notaryRegistry: string;
    documentRegistry: string;
    ntkr: string;
    ntk: string;
    multisig: string;
    genesisNft: string;
    genesisActivation: string;
  };
  config_version: number;
}

export type ConfigStatus = 'loading' | 'ready' | 'error';

interface ConfigContextType {
  status: ConfigStatus;
  config: SystemConfig | null;
  error: { code: string; message: string } | null;
  retry: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigAuthorityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConfigStatus>('loading');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchConfig = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      // BASE_URL assumed to be configured in axios or env
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await axios.get(`${API_BASE}/api/system/config`);
      
      const newConfig = response.data;

      // 🛡️ Final Frontend Integrity Check
      if (Number(newConfig.chainId) !== 97) {
        throw { code: 'INVALID_CHAIN_ID', message: `Expected Chain 97, but Backend served ${newConfig.chainId}` };
      }

      setConfig(newConfig);
      setStatus('ready');
      setRetryCount(0); // Reset on success

    } catch (err: any) {
      console.error('❌ [CONFIG_AUTHORITY_FAIL]', err);
      
      const errorState = {
        code: err.code || (err.response?.data?.code) || 'NETWORK_FAILURE',
        message: err.message || (err.response?.data?.detail) || 'Could not reach configuration authority.'
      };

      setError(errorState);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const value = {
    status,
    config,
    error,
    retry: () => {
      setRetryCount(prev => prev + 1);
      fetchConfig();
    }
  };

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigAuthorityProvider');
  }
  return context;
};
