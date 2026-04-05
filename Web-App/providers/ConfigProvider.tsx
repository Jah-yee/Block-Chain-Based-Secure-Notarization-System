"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

/**
 * 🛡️ CONFIG PROVIDER (WEB-APP)
 * Responsibility: Single solicitor of authoritative configuration from the Backend.
 * Rules:
 * - Fail-Closed: Blocks app if backend is inconsistent or unreachable.
 * - Dynamic: Version-aware re-initialization.
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

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConfigStatus>('loading');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      console.log("🛡️ [CONFIG] Fetching authoritative system parameters...");
      const data = await apiClient.get('/api/system/config');
      
      // 🛡️ Final Integrity Check
      if (!data.chainId || isNaN(Number(data.chainId))) {
        throw { code: 'INVALID_CHAIN_ID', message: `Backend served invalid or missing chainId: ${data.chainId}` };
      }

      setConfig(data);
      setStatus('ready');
    } catch (err: any) {
      console.error("❌ [CONFIG_AUTHORITY_FAIL]", err);
      setError({
        code: err.code || 'CONNECTION_FAILURE',
        message: err.message || 'Could not establish connection with Configuration Authority.'
      });
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <ConfigContext.Provider value={{ status, config, error, retry: fetchConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
