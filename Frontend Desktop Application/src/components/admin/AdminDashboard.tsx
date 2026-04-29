import { useState, useEffect, useCallback } from "react";
import { AuthStatusBar } from "./Management/AuthStatusBar";
import { HealthGrid } from "./Management/HealthGrid";
import { ActionPanel } from "./Management/ActionPanel";
import { EventRecorder } from "./Management/EventRecorder";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

export function AdminDashboard({ onNavigate, isDarkMode, user: initialUser }: { onNavigate?: (s: string) => void; isDarkMode?: boolean; user?: any }) {
  const [user, setUser] = useState<any>(initialUser || null);
  const [stuckCount, setStuckCount] = useState(0);
  const [isCritical, setIsCritical] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialUser);

  const fetchSystemData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Identity via Proxy (Main Process injects token)
      const userData = await (window as any).electronAPI.api.call("/api/auth/me");
      setUser(userData?.user || null);

      // 2. Fetch Sync Health for Action Panel
      const health = await (window as any).electronAPI.api.call("/api/system/sync/health");
      
      // 🛡️ [PROTECTION] Defend against non-object responses or missing summary
      const summary = health?.summary || {};
      
      const totalStuck = (Number(summary.stuck_identity_processing) || 0) + (Number(summary.stuck_role_processing) || 0);
      setStuckCount(totalStuck);

      // 🛡️ [SECURITY] Semantic Criticality derivation
      const critical = 
        (Number(summary.perm_failed_identity) || 0) > 0 || 
        (Number(summary.perm_failed_role) || 0) > 0 || 
        totalStuck > 0;
      setIsCritical(critical);

    } catch (err: any) {
      console.warn("[MANAGEMENT] Critical data fetch failure:", err.message);
      setIsCritical(true); // Fail-Closed: Treat fetch failure as critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 60000); // 1m systematic refresh
    return () => clearInterval(interval);
  }, [fetchSystemData]);

  if (isLoading && !user) {
    return (
      <div className="flex-1 bg-[#07090e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <span className="text-[10px] font-black tracking-widest text-emerald-500/50 uppercase italic">Initializing Management Portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e] relative">
      {/* 1. Auth Status Bar (Persistent System Truth) */}
      <div className="flex-none">
        <AuthStatusBar user={user} isLocked={false} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto p-8 pt-8 space-y-8 pb-24">
          {/* Header Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none select-none flex items-center gap-4">
                ADMINISTRATION PORTAL
              </h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] mt-2 italic shadow-emerald-500/10">BBSNS Management Node</p>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                  variant="ghost" 
                  onClick={() => fetchSystemData()}
                  className="text-slate-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                  <RefreshCw size={14} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  SYSTEM RE-SYNC
              </Button>
            </div>
          </div>
  
          {/* 2. Primary Status Grid (Backend / Chain / Workers) */}
          <HealthGrid />
  
          {/* 3. Action Decision Panel (Remediation) */}
          <ActionPanel 
            stuckCount={stuckCount} 
            isCritical={isCritical} 
            isDegraded={user?.zeroTrustStatus === 'DEGRADED'} 
          />
  
          {/* 5. Trust Boundary Overlay (Only show if total identity & data isolation occurred) */}
          {(!isLoading && !user && isCritical) && (
            <div className="absolute inset-0 bg-[#07090e]/80 backdrop-blur-2xl z-50 flex items-center justify-center p-8 animate-in fade-in duration-700">
              <div className="max-w-md w-full text-center space-y-6">
                  <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                  </div>
                  <h2 className="text-3xl font-black text-white italic tracking-tighter">SESSION EXPIRED</h2>
                  <p className="text-slate-400 text-sm italic leading-relaxed">The secure link to the management node has timed out or the session has been invalidated. Please re-authenticate to continue.</p>
                  <Button onClick={() => window.location.reload()} className="w-full bg-red-500 hover:bg-red-600 font-black h-16 rounded-2xl transition-all shadow-red-500/20 shadow-xl">RE-AUTHENTICATE</Button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
