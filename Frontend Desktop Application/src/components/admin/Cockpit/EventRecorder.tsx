import { Terminal, Database, ShieldCheck, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

interface SyncEvent {
  id: string;
  event_type: string;
  status_after: string;
  status_before: string;
  tx_hash?: string;
  error?: string;
  metadata?: any;
  created_at: string;
}

export function EventRecorder() {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async () => {
    try {
      // 🛡️ [SECURITY] Cursor-based pagination (since=lastSeen) to prevent re-fetch loops
      const url = lastSeen 
        ? `/api/system/sync/events?limit=50&cursor=${lastSeen}`
        : `/api/system/sync/events?limit=50`;

      const data = await (window as any).electronAPI.api.call(url);
      
      // 🛡️ [PROTECTION] Enforce array type for telemetry data
      if (data && Array.isArray(data) && data.length > 0) {
        setEvents(prev => {
          // Merge and sort by timestamp
          const combined = [...data, ...prev].slice(0, 50);
          return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });
        setLastSeen(data[0].created_at);
      }
    } catch (e) {
      console.warn("[EVENT_RECORDER] Telemetry link degraded.");
    }
  }, [lastSeen]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(() => {
      if (isLive) fetchEvents();
    }, 10000); // 10s pulse for truth
    return () => clearInterval(interval);
  }, [isLive, fetchEvents]);

  return (
    <div className="bg-[#0a0d14] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[450px] shadow-2xl relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.03),transparent_50%)] pointer-events-none" />
      
      {/* Header */}
      <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <Terminal size={18} className="text-emerald-400" />
          <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">FLIGHT RECORDER</h3>
          <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] text-emerald-400 font-bold uppercase animate-pulse">
            LIVE TELEMETRY
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsLive(!isLive)}
            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all border ${isLive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}
          >
            {isLive ? 'MONITOR ACTIVE' : 'MONITOR PAUSED'}
          </button>
          <button onClick={() => { setEvents([]); setLastSeen(null); fetchEvents(); }} className="text-slate-500 hover:text-white transition-all">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-2 font-mono text-[10px] scrollbar-thin scrollbar-thumb-white/10 relative z-10"
      >
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-2 italic">
            <Database size={24} className="opacity-20" />
            <span>Establishing telemetry handshake...</span>
          </div>
        ) : (
          events.map((event, i) => (
            <div key={event.id} className="flex gap-4 p-2 rounded-lg hover:bg-white/5 transition-all group animate-in slide-in-from-left-2 duration-500">
                <span className="text-slate-600 shrink-0 select-none">[{new Date(event.created_at).toLocaleTimeString()}]</span>
                
                <span className={`w-28 shrink-0 font-black uppercase tracking-tighter ${
                    event.status_after === 'confirmed' || event.status_after === 'SUCCESS' ? 'text-emerald-500' : (event.error ? 'text-red-500' : 'text-blue-500')
                }`}>
                    [{event.status_after || "PENDING"}]
                </span>

                <div className="flex-1 text-slate-300">
                    <span className="text-emerald-400/80 font-bold uppercase">{event.event_type}</span>: 
                    <span className="ml-2 italic opacity-80">{event.error || (event.metadata?.reason) || "Synchronizing protocol state"}</span>
                    {event.tx_hash && (
                        <a 
                            href={`https://testnet.bscscan.com/tx/${event.tx_hash}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="ml-3 text-emerald-500/40 hover:text-emerald-500 underline flex inline-flex items-center gap-1"
                        >
                            TX:{event.tx_hash.slice(0, 8)}... <ExternalLink size={8} />
                        </a>
                    )}
                </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-2 bg-black/40 border-t border-white/5 text-slate-600 text-[8px] flex justify-between font-mono italic relative z-10">
        <span>BBSNS.MONITOR.NODE_1</span>
        <span>AUTH: AUTHORITATIVE</span>
      </div>
    </div>
  );
}
