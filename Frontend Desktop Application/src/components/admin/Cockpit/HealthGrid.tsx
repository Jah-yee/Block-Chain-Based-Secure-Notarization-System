import { Activity, Globe, Zap, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent } from "../../ui/card";

interface HealthStatus {
  backend: { status: 'ok' | 'warn' | 'err'; message: string; latency?: number };
  chain: { status: 'ok' | 'err'; blockHeight: number; synced: boolean };
  workers: { status: 'ok' | 'warn' | 'err'; active: number; stuck: number };
}

export function HealthGrid() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const data = await (window as any).electronAPI.api.call("/api/system/sync/health");
      
      // 🛡️ [PROTECTION] Safe-access for telemetry summary
      const summary = data?.summary || {};
      
      const isCritical = 
        (Number(summary.perm_failed_identity) || 0) > 0 || 
        (Number(summary.perm_failed_role) || 0) > 0 || 
        (Number(summary.stuck_identity_processing) || 0) > 0 || 
        (Number(summary.stuck_role_processing) || 0) > 0;

      // WARNING (warn) = failed attempts exist but not permanent yet, or high avg retries
      const isWarning = 
        !isCritical && (
          (Number(summary.failed_identity) || 0) > 0 || 
          (Number(summary.failed_role) || 0) > 0 ||
          (Number(summary.avg_identity_retries) || 0) > 2.0
        );

      setHealth({
        backend: { status: 'ok', message: "Production Node", latency: 42 },
        chain: { status: summary.oldest_pending_task_age ? 'warn' : 'ok', blockHeight: summary.last_processed_block || 0, synced: true },
        workers: { 
          status: isCritical ? 'err' : (isWarning ? 'warn' : 'ok'), 
          active: (Number(summary.failed_identity) || 0) + (Number(summary.failed_role) || 0),
          stuck: (Number(summary.stuck_identity_processing) || 0) + (Number(summary.stuck_role_processing) || 0)
        }
      });
    } catch (e: any) {
      // 🩺 [RESILIENCE] Main Process Error Differentiation
      const errorStatus = e.message === 'DEGRADED' ? 'warn' : 'err';
      let msg = "Connection Error";
      if (e.message === 'OFFLINE') msg = "Node Unreachable";
      if (e.message === 'DEGRADED') msg = "High Latency";
      if (e.message === 'AUTH_LOST') msg = "Session Terminated";

      setHealth({
        backend: { status: errorStatus as any, message: msg },
        chain: { status: 'err', blockHeight: 0, synced: false },
        workers: { status: 'err', active: 0, stuck: 0 }
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // Pulse every 15s for truth
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !health) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-white/5 border border-white/5 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Backend Health */}
      <HealthCard 
        title="BACKEND AUTHORITY"
        status={health?.backend.status === 'ok' ? 'SUCCESS' : (health?.backend.status === 'warn' ? 'DEGRADED' : 'FAIL')}
        icon={Globe}
        color={health?.backend.status === 'ok' ? 'emerald' : (health?.backend.status === 'warn' ? 'yellow' : 'red')}
        metrics={[
          { label: "Identity Node", value: "13.203.121.127" },
          { label: "Status", value: health?.backend.message || "Checking..." }
        ]}
      />

      {/* Chain Health */}
      <HealthCard 
        title="BLOCKCHAIN SYNC"
        status={health?.chain.status === 'ok' ? 'SYNCED' : (health?.chain.status === 'warn' ? 'DELAYED' : 'FAULT')}
        icon={ShieldCheck}
        color={health?.chain.status === 'ok' ? 'emerald' : (health?.chain.status === 'warn' ? 'yellow' : 'red')}
        metrics={[
          { label: "Sync Pulse", value: health?.chain.synced ? "Connected" : "Disconnected" },
          { label: "Integrity", value: health?.chain.status === 'ok' ? "Verified" : "Drifting" }
        ]}
      />

      {/* Worker Health */}
      <HealthCard 
        title="SYNC WORKERS"
        status={health?.workers.status === 'ok' ? 'NORMAL' : (health?.workers.status === 'warn' ? 'WARNING' : 'CRITICAL')}
        icon={Zap}
        color={health?.workers.status === 'ok' ? 'emerald' : (health?.workers.status === 'warn' ? 'yellow' : 'red')}
        metrics={[
          { label: "Stalled Workers", value: `${health?.workers.stuck} tasks` },
          { label: "Manual Remediation", value: health?.workers.status === 'err' ? "Required" : "Not Required" }
        ]}
        alert={health?.workers.status === 'err' ? "🔥 CRITICAL" : (health?.workers.status === 'warn' ? "⚠️ MONITOR" : undefined)}
      />
    </div>
  );
}

function HealthCard({ title, status, icon: Icon, color, metrics, alert }: any) {
  const colorMap: any = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
    yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20 shadow-yellow-500/5",
    red: "text-red-400 bg-red-500/10 border-red-500/20 shadow-red-500/5"
  };

  return (
    <Card className="bg-[#0a101f]/40 backdrop-blur-3xl border border-white/5 rounded-2xl overflow-hidden group hover:border-emerald-500/20 transition-all shadow-2xl">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${colorMap[color]}`}>
              <Icon size={18} />
            </div>
            <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">{title}</span>
          </div>
          <div className={`px-2 py-0.5 rounded text-[9px] font-black italic tracking-tighter border ${colorMap[color]}`}>
            {status}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {metrics.map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-mono">{m.label}</span>
              <span className="text-xs font-bold text-white uppercase tracking-tight">{m.value}</span>
            </div>
          ))}
        </div>

        {alert && (
          <div className={`mt-2 flex items-center justify-center gap-2 py-1.5 border rounded-lg animate-pulse ${colorMap[color]}`}>
            <AlertTriangle size={10} className={color === 'red' ? 'text-red-400' : 'text-yellow-400'} />
            <span className="text-[9px] font-black uppercase tracking-widest leading-none">{alert}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
