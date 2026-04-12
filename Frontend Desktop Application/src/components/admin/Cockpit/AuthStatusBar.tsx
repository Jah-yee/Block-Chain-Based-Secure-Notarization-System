import { Shield, Lock, Unlock, Zap, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface AuthStatusBarProps {
  user: any;
  isLocked?: boolean;
}

export function AuthStatusBar({ user, isLocked = false }: AuthStatusBarProps) {
  const [deviceId, setDeviceId] = useState<string>("Scanning...");
  const [sessionTime, setSessionTime] = useState<string>("12:00:00");

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const dId = await (window as any).electronAPI.auth.getDeviceId();
        setDeviceId(dId);
      } catch (e) {
        setDeviceId("Unknown Device");
      }
    };
    fetchMetadata();
    
    // Simple countdown timer (placeholder for real TTL logic)
    const timer = setInterval(() => {
      setSessionTime(prev => {
        // Simple logic for display
        return prev; 
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-[#0a0d14] border-b border-white/5 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-6">
        {/* Vault Status */}
        <div className="flex items-center gap-2">
          {isLocked ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
              <Lock size={12} className="text-red-400" />
              <span className="text-[10px] font-black text-red-400 uppercase tracking-widest italic">VAULT LOCKED</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <Unlock size={12} className="text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest italic">VAULT UNLOCKED</span>
            </div>
          )}
        </div>

        {/* Device ID */}
        <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-6">
          <Zap size={12} className="text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Device: {(deviceId || "Scanning...").slice(0, 18)}...</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Session TTL */}
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
          <Clock size={12} className="text-blue-400" />
          <span className="text-[10px] font-mono font-bold text-blue-400">SESSION EXPIRES: {sessionTime}</span>
        </div>

        {/* Identity Icon (Pruned text to avoid redundancy with Sidebar) */}
        <div className="flex items-center gap-3 pl-6 border-l border-white/10">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield size={16} className="text-emerald-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
