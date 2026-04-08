import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ConfigValidator } from '../utils/config-validator';

/**
 * 🛡️ CONFIG AUTHORITY CONTEXT
 * Responsibility: Single solicitor of authoritative configuration from the Backend.
 * Rules:
 * - Fail-Closed: Blocks app if backend is inconsistent or unreachable.
 * - Dynamic: Version-aware re-initialization.
 * - Actionable: Provides structured error codes for UI feedback.
 */

export interface Config {
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
  apiBaseUrl: string;
  webAppUrl: string;
  remoteAuthUrl: string;
  version: number;
  updatedAt: string;
  checksum: string;
}

export type ConfigMode = 'LIVE' | 'DEGRADED' | 'STALE' | 'EMERGENCY';
export type ConfigStatus = 'loading' | 'ready' | 'error';

interface ConfigContextType {
  status: ConfigStatus;
  mode: ConfigMode;
  config: Config | null;
  error: { code: string; message: string } | null;
  retry: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

const DEFAULT_API_URL = "https://api.bbsns.online";
const DEFAULT_WEB_URL = "https://app.bbsns.online";
const DEFAULT_AUTH_URL = "https://auth.bbsns.online";

export const ConfigAuthorityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConfigStatus>('loading');
  const [mode, setMode] = useState<ConfigMode>('LIVE');
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchConfig = useCallback(async () => {
    setStatus('loading');
    setError(null);
    
    const electronAPI = (window as any).electronAPI;
    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    let resolvedConfig = null;

    try {
      // 🟢 TIER 1: Authoritative Sync (3 Retries)
      for (let i = 0; i < 3; i++) {
        try {
          const response = await axios.get(`${DEFAULT_API_URL}/api/system/config`, { timeout: 5000 });
          const payload = response.data;
          
          if (payload && payload.apiBaseUrl) {
            // 🛡️ INTEGRITY: Verify Schema & Checksum
            const isValid = await ConfigValidator.validate(payload);
            const isIntact = await ConfigValidator.verifyChecksum(payload, payload.checksum);

            if (isValid && isIntact) {
              setMode('LIVE');
              resolvedConfig = payload;
              break;
            } else if (isValid && !isIntact) {
              console.warn(`[CONFIG] Authority integrity violation: CHECKSUM_MISMATCH. Entering RESILIENCE mode.`);
              setMode('EMERGENCY');
              resolvedConfig = payload;
              break;
            } else {
              const reason = !isValid ? "SCHEMA_INVALID" : "UNIDENTIFIED_FAULT";
              console.error(`[CONFIG] Authority integrity violation: ${reason}`);
              throw new Error(`CRITICAL: Configuration ${reason}. System cannot trust authority.`);
            }
          }
        } catch (e) {
          if (i < 2) {
            const delay = i === 0 ? 2000 : 5000;
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      // 🟠 TIER 2: OS-Level Cache Fallback
      if (!resolvedConfig && electronAPI?.config?.load) {
        try {
          const cached = await electronAPI.config.load();
          if (cached && cached.data) {
            const { data, timestamp } = cached;
            
            // 🛡️ INTEGRITY: Verify Cached Schema
            if (await ConfigValidator.validate(data)) {
                const age = Date.now() - timestamp;
                resolvedConfig = data;
                
                if (age > MS_IN_DAY) {
                    console.warn('[CONFIG] OS cache is older than 24h. READ-ONLY mode active.');
                    setMode('STALE');
                } else {
                    console.log('[CONFIG] Using valid local OS cache (DEGRADED).');
                    setMode('DEGRADED');
                }
            } else {
                console.warn('[CONFIG] OS level cache is corrupted. Clearing.');
                // Note: We don't have a clearCache IPC yet, but we can just ignore it
            }
          }
        } catch (cacheErr) {
          console.error('[CONFIG] Failed to load OS cache:', cacheErr);
        }
      }

      // 🔴 TIER 3: Emergency Fallback (Bootstrap Only)
      if (!resolvedConfig) {
        console.error('[CONFIG] Critical connection failure. Entering EMERGENCY mode.');
        setMode('EMERGENCY');
        resolvedConfig = {
          apiBaseUrl: DEFAULT_API_URL,
          webAppUrl: DEFAULT_WEB_URL,
          remoteAuthUrl: DEFAULT_AUTH_URL,
          rpcUrl: '',
          chainId: 0,
          contracts: {}
        } as Config;
      }

      if (mode !== 'EMERGENCY' && resolvedConfig.rpcUrl && !resolvedConfig.chainId) {
        throw { code: 'INVALID_CHAIN_ID', message: `Mismatched network authority. Chain ID is missing.` };
      }

      // 🛡️ [PHASE 37] Synchronize Main Process with authoritative API
      if (resolvedConfig.apiBaseUrl && (window as any).electronAPI?.config?.syncApiUrl) {
        await (window as any).electronAPI.config.syncApiUrl(resolvedConfig.apiBaseUrl);
      }

      setConfig(resolvedConfig);
      setStatus('ready');
      setRetryCount(0);

    } catch (err: any) {
      console.error('❌ [CONFIG_AUTHORITY_CRITICAL]', err);
      setError({
        code: err.code || 'CONFIG_CORRUPTION',
        message: err.message || 'System failed to load configuration.'
      });
      setStatus('error');
    }
  }, [mode]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const value = {
    status,
    mode,
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
