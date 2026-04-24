import { AlertCircle, RefreshCw, Layers, ShieldCheck, Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/button";
import { toast } from "sonner";

interface ActionPanelProps {
  stuckCount: number;
  isCritical?: boolean;
  isDegraded?: boolean;
}

export function ActionPanel({ stuckCount, isCritical = false, isDegraded = false }: ActionPanelProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAuditInProgress, setIsAuditInProgress] = useState(false);

  const handleRetryAll = async () => {
    setIsRetrying(true);
    try {
      const res = await (window as any).electronAPI.api.call("/api/system/sync/retry", "POST");
      toast.success(res.message || "Manual retry sweep initiated.");
    } catch (e: any) {
      if (e.message.includes('429')) {
        toast.error("Retry Sweep on Cooldown (30s). Please wait.");
      } else if (e.message === 'DEGRADED' || e.message === 'OFFLINE') {
        toast.error("Action Unavailable: Backend Connectivity Weak.");
      } else {
        toast.error("Retry failed: " + e.message);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAuditChain = async () => {
    setIsAuditInProgress(true);
    try {
      // 🛡️ [RESILIENCE] 1. Force Provider Sweep (Clears Blacklist)
      await (window as any).electronAPI.api.call("/api/system/sync/reset-providers", "POST");
      
      // 🛡️ [RESILIENCE] 2. Authoritative Sync Verification
      await (window as any).electronAPI.api.call("/api/system/health");
      toast.success("Tier Sweep Complete. Successfully found healthy RPC node.");
    } catch (e: any) {
      toast.error("Audit failed: " + e.message);
    } finally {
      setIsAuditInProgress(false);
    }
  };

  return (
    <div className="bg-[#0a101f]/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group h-full">
      {/* Background Glow */}
      <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl transition-all duration-700 ${isCritical ? 'bg-red-500/5 group-hover:bg-red-500/10' : 'bg-emerald-500/5 group-hover:bg-emerald-500/10'}`} />
      
      <div className="relative z-10 space-y-6">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 border rounded-2xl flex items-center justify-center ${isCritical ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
            <Layers size={24} className={isCritical ? 'text-red-400' : 'text-emerald-400'} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white italic tracking-tighter">CONTROL CENTER</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Operational Decisions Required</p>
          </div>
        </div>

        {/* Semantic Alert Section */}
        {stuckCount > 0 || isCritical ? (
          <div className={`p-4 border rounded-2xl space-y-3 ${isCritical ? 'bg-red-500/5 border-red-500/20 animate-pulse' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
            <div className="flex items-center gap-3">
              <AlertCircle size={14} className={isCritical ? 'text-red-400' : 'text-yellow-400'} />
              <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}>
                {isCritical ? '🔥 SYSTEM CRITICAL' : '⚠️ ATTENTION REQUIRED'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic">
                {isCritical ? (
                    "Permanent failures or high-latency drifts detected. Immediate manual sweep of the sync engine is required to maintain protocol integrity."
                ) : (
                    `The system has detected ${stuckCount} stalled sync events. A manual retry sweep is recommended.`
                )}
            </p>
            <div className="flex items-center gap-3">
                <Button 
                    onClick={handleRetryAll}
                    disabled={isRetrying}
                    className={`flex-1 font-black text-[10px] tracking-widest rounded-xl h-10 transition-all ${isDegraded ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 hover:bg-amber-500/30' : (isCritical ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-emerald-500 hover:bg-emerald-500/90 text-white')}`}
                >
                    {isRetrying ? <Loader2 className="animate-spin w-4 h-4" /> : (
                      isDegraded ? (
                        <span className="flex items-center gap-2 italic"><ShieldCheck size={12} /> PROCEED (DEGRADED SESSION)</span>
                      ) : (
                        isCritical ? "EXECUTE EMERGENCY RECOVERY" : "PROCEED WITH RETRY SWEEP"
                      )
                    )}
                </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest italic tracking-tight">System workers functioning within normal operational bounds.</span>
          </div>
        )}

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            variant="outline"
            onClick={handleAuditChain}
            disabled={isAuditInProgress}
            className="h-16 rounded-2xl border-white/5 bg-white/5 hover:bg-white/10 hover:border-emerald-500/20 text-slate-300 flex flex-col items-center justify-center gap-1 transition-all"
          >
            {isAuditInProgress ? <Loader2 className="animate-spin w-4 h-4 text-emerald-400" /> : <RefreshCw size={16} className="text-emerald-400 opacity-50" />}
            <span className="text-[9px] font-black tracking-widest uppercase italic">Force Chain Audit</span>
          </Button>
          <Button 
            variant="outline"
            className="h-16 rounded-2xl border-white/5 bg-white/5 hover:bg-white/10 hover:border-blue-500/20 text-slate-300 flex flex-col items-center justify-center gap-1 transition-all"
          >
            <Info size={16} className="text-blue-400 opacity-50" />
            <span className="text-[9px] font-black tracking-widest uppercase italic">System Handshake</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
