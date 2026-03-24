import React from 'react';
import { useConfig } from '../contexts/ConfigAuthority';

/**
 * 🛠️ CONFIG BARRIER COMPONENT
 * Responsibility: Protect the system from inconsistent or dead configuration states.
 * Logic:
 * - Status 'loading': Full screen spinner.
 * - Status 'error': Full screen blocking overlay with diagnostics.
 * - Status 'ready': Renders children.
 */

export const ConfigBarrier: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, error, retry } = useConfig();

  if (status === 'ready') {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-950 text-white p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
        
        {/* Header Icon */}
        <div className="flex justify-center">
          <div className={`p-6 rounded-full ${status === 'loading' ? 'bg-blue-900/20' : 'bg-red-900/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]'}`}>
            {status === 'loading' ? (
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
        </div>

        {/* Messaging */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {status === 'loading' ? 'Initializing System Authority...' : 'System Not Ready'}
          </h1>
          <p className="text-gray-400 leading-relaxed">
            {status === 'loading' 
              ? 'Verifying blockchain parameters and synchronizing with backend. Please wait.' 
              : 'The application cannot proceed because the configuration authority is in an inconsistent state.'}
          </p>
        </div>

        {/* Diagnostics (Error only) */}
        {status === 'error' && error && (
          <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg text-left font-mono text-xs space-y-2">
            <div className="flex justify-between border-b border-gray-800 pb-2 mb-2">
              <span className="text-gray-500 uppercase">Error Code</span>
              <span className="text-red-400 font-bold">{error.code}</span>
            </div>
            <div className="text-gray-300 break-words">
              {error.message}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-4">
          {status === 'error' ? (
            <button
              onClick={retry}
              className="px-8 py-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-red-500/20"
            >
              Retry Connection
            </button>
          ) : (
            <div className="flex flex-col items-center space-y-2 text-gray-500">
              <span className="text-xs uppercase tracking-widest animate-pulse">Establishing Zero-Trust Handshake...</span>
            </div>
          )}
        </div>

        {/* Organisation Branding (Optional/Mockup) */}
        <div className="mt-20 opacity-30">
          <div className="text-[10px] uppercase tracking-[0.3em]">BBSNS SECURITY COMMAND</div>
        </div>
      </div>
    </div>
  );
};
