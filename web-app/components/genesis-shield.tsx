"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { ShieldAlert, Loader2 } from "lucide-react"

export function GenesisShield({ children }: { children: React.ReactNode }) {
    const [viewState, setViewState] = useState<'checking' | 'active' | 'boot'>('checking')

    const checkState = React.useCallback(async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/api/auth/system-status`);
            if (res.ok) {
                const data = await res.json();
                if (data.activated) {
                    setViewState('active');
                    return;
                }
            }
            setViewState('boot');
        } catch (err) {
            console.error("Failed to read Genesis state:", err);
            setViewState('boot');
        }
    }, [])

    useEffect(() => {
        checkState()
    }, [checkState])

    if (viewState === 'checking') {
        return (
            <div className="min-h-screen bg-[#0A0C10] text-[#E2E8F0] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 text-[#3B82F6] animate-spin" />
                <h2 className="text-xl font-medium">Verifying System Integrity...</h2>
            </div>
        )
    }

    if (viewState === 'active') {
        return <>{children}</>
    }

    // View State: 'boot'
    return (
        <div className="min-h-screen bg-[#0A0C10] flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md w-full bg-[#11141A] border border-[#1E293B] rounded-2xl p-8 shadow-2xl">
                <div className="flex justify-center mb-6">
                    <div className="bg-red-500/10 p-4 rounded-full border border-red-500/20">
                        <ShieldAlert className="w-12 h-12 text-red-400" />
                    </div>
                </div>
                
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">System Not Initialized</h1>
                <p className="text-[#94A3B8] mb-8 leading-relaxed">
                    The BBSNS protocol requires the Genesis Admin to initialize the system. 
                    Please open the Desktop Application to complete the Genesis sequence.
                </p>
                <div className="bg-[#0A0C10] border border-[#1E293B] rounded-lg p-4 mb-4">
                    <p className="text-sm font-mono text-[#64748B] mb-1">Status</p>
                    <p className="text-sm text-yellow-500 truncate animate-pulse">Awaiting Initialization...</p>
                </div>
            </div>
        </div>
    )
}

