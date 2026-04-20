"use client";

import React from 'react';
import { useWalletSession } from '@/hooks/use-wallet-session';
import { useIntegrity } from '@/hooks/use-integrity';

const ResilienceBanner: React.FC = () => {
    const { isIntegrityCompromised, isStale, isSlowSyncMode } = useIntegrity();
    const { isRestricted, restrictionDetail } = useWalletSession();

    // Priority 1: Restricted Identity (Authorization Failure)
    if (isRestricted) {
        return (
            <div style={{
                width: '100%',
                padding: '8px 16px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 600,
                zIndex: 9999,
                position: 'fixed',
                top: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                backgroundColor: '#FFF1F2',
                color: '#E11D48',
                borderBottom: '1px solid #FDA4AF'
            }}>
                <span style={{ fontSize: '16px' }}>🛡️</span>
                <strong>Account Restricted:</strong> {restrictionDetail || 'Verification required for full access.'}
            </div>
        );
    }

    // Priority 2: Infrastructure Degradation (Integrity Compromise / Slow-Sync)
    // We show this when status 426 is received or polling is forced to slow mode
    if (isIntegrityCompromised || isSlowSyncMode) {
        return (
            <div style={{
                width: '100%',
                padding: '8px 16px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 600,
                zIndex: 9999,
                position: 'fixed',
                top: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                backgroundColor: '#7F1D1D',
                color: '#FFFFFF',
                borderBottom: '1px solid #000'
            }}>
                <span style={{ fontSize: '16px' }}>🚨</span>
                <strong>Blockchain connection unstable:</strong> {isSlowSyncMode ? 'Switching to slow-sync mode. Retry in 10s.' : 'Synchronizing environment integrity...'}
            </div>
        );
    }

    // Priority 3: Data Staleness (Observed Metadata)
    if (isStale) {
        return (
            <div style={{
                width: '100%',
                padding: '8px 16px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: 600,
                zIndex: 9999,
                position: 'fixed',
                top: 0,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                backgroundColor: '#FFFBEB',
                color: '#92400E',
                borderBottom: '1px solid #FBBF24'
            }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                <strong>Data Synchronization Delayed:</strong> Some information may be out of sync. High-risk actions may be restricted.
            </div>
        );
    }

    return null;
};

export default ResilienceBanner;
