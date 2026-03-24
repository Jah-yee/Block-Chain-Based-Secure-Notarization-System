"use client";

import React from 'react';
import { useConfig } from '@/providers/ConfigProvider';
import { ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 🛠️ CONFIG BARRIER (WEB-APP)
 * Responsibility: Protect the system from inconsistent or dead configuration states.
 * Rules:
 * - Status 'loading': Full screen spinner.
 * - Status 'error': Full screen blocking overlay with diagnostics.
 * - Status 'ready': Renders children.
 */

export function ConfigBarrier({ children }: { children: React.ReactNode }) {
  const { status, config, error, retry } = useConfig();

  if (status === 'ready') {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
        
        {/* Header Icon */}
        <div className="flex justify-center">
          <div className={`p-6 rounded-full ${status === 'loading' ? 'bg-primary/10' : 'bg-destructive/10 shadow-[0_0_30px_rgba(239,68,68,0.2)]'}`}>
            {status === 'loading' ? (
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            ) : (
              <ShieldAlert className="w-12 h-12 text-destructive" />
            )}
          </div>
        </div>

        {/* Messaging */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight italic">
            {status === 'loading' ? 'ESTABLISHING TRUST...' : 'SYSTEM PROTOCOL ERROR'}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {status === 'loading' 
              ? 'Synchronizing with Backend Configuration Authority. Please wait while we verify blockchain parameters.' 
              : 'The application cannot proceed because the configuration authority is in an inconsistent state or unreachable.'}
          </p>
        </div>

        {/* Diagnostics (Error only) */}
        {status === 'error' && error && (
          <div className="p-4 bg-muted/50 border border-border rounded-lg text-left font-mono text-xs space-y-2">
            <div className="flex justify-between border-b border-border pb-2 mb-2">
              <span className="text-muted-foreground uppercase">Code</span>
              <span className="text-destructive font-bold">{error.code}</span>
            </div>
            <div className="text-foreground break-words">
              {error.message}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-4">
          {status === 'error' ? (
            <Button
              onClick={retry}
              variant="destructive"
              className="w-full h-12 rounded-xl font-bold shadow-lg shadow-destructive/20 transition-all hover:scale-[1.02]"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> RECONNECT PROTOCOL
            </Button>
          ) : (
            <div className="flex flex-col items-center space-y-2 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-[0.3em] animate-pulse italic">Zero-Trust Handshake in Progress...</span>
            </div>
          )}
        </div>

        <div className="mt-20 opacity-20 pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.4em] font-black italic">BBSNS | NETWORK AUTHORITY V2</div>
        </div>
      </div>
    </div>
  );
}
