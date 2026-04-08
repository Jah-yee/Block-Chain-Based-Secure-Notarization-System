"use client";

import React, { useEffect, useState } from 'react';
import { useWalletSession } from '@/hooks/use-wallet-session';

const ResilienceBanner: React.FC = () => {
    const [mode, setMode] = useState<'LIVE' | 'DEGRADED' | 'STALE' | 'EMERGENCY' | null>(null);
    const { isRestricted, restrictionDetail } = useWalletSession();

    useEffect(() => {
        const handleConfigLoaded = (e: any) => {
            setMode(e.detail.mode);
        };

        window.addEventListener('bbs_config_loaded', handleConfigLoaded);
        return () => window.removeEventListener('bbs_config_loaded', handleConfigLoaded);
    }, []);

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

    // Priority 2: Infrastructure Resilience
    if (!mode || mode === 'LIVE') return null;

    const bannerStyles: Record<string, React.CSSProperties> = {
// ... rest of component
        container: {
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
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        },
        STALE: {
            backgroundColor: '#FEF2F2',
            color: '#991B1B',
            borderBottom: '1px solid #F87171'
        },
        DEGRADED: {
            backgroundColor: '#FFFBEB',
            color: '#92400E',
            borderBottom: '1px solid #FBBF24'
        },
        EMERGENCY: {
            backgroundColor: '#7F1D1D',
            color: '#FFFFFF',
            borderBottom: '1px solid #000'
        }
    };

    const messages = {
        STALE: '⚠️ Configuration is outdated (>24h). Write operations are disabled. Please check your internet connection and refresh.',
        DEGRADED: '📡 Network synchronization delayed. System is running in Offline/Read-Only mode.',
        EMERGENCY: '🚨 CRITICAL: System failed to synchronize authority. Most features are disabled.'
    };

    return (
        <div style={{ ...bannerStyles.container, ...bannerStyles[mode] }}>
            {messages[mode as keyof typeof messages]}
            {mode === 'STALE' && (
                <button 
                    onClick={() => window.location.reload()}
                    style={{
                        marginLeft: '12px',
                        padding: '2px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: '1px solid currentColor',
                        backgroundColor: 'transparent',
                        color: 'inherit'
                    }}
                >
                    Reconnect
                </button>
            )}
        </div>
    );
};

export default ResilienceBanner;
