import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { ConfigMode } from '../../contexts/ConfigAuthority';

interface ResilienceBannerProps {
  mode: ConfigMode;
  onRetry: () => void;
}

export const ResilienceBanner: React.FC<ResilienceBannerProps> = ({ mode, onRetry }) => {
  if (mode === 'LIVE') return null;

  const config = {
    STALE: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: <AlertCircle className="w-4 h-4" />,
      message: 'Configuration outdated (>24h). Write operations disabled.'
    },
    DEGRADED: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: <WifiOff className="w-4 h-4" />,
      message: 'System Offline. Running in Read-Only mode with local cache.'
    },
    EMERGENCY: {
        bg: 'bg-slate-900',
        border: 'border-red-500',
        text: 'text-red-500',
        icon: <AlertCircle className="w-4 h-4" />,
        message: 'CRITICAL: Authority sync failed. No valid connectivity.'
    }
  }[mode];

  if (!config) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[10000] animate-in fade-in slide-in-from-bottom-5 duration-500`}>
      <div className={`flex items-center gap-3 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-xl ${config.bg} ${config.border}`}>
        <div className={config.text}>{config.icon}</div>
        <span className={`text-[10px] font-black uppercase tracking-widest ${config.text}`}>
          {config.message}
        </span>
        
        {(mode === 'STALE' || mode === 'EMERGENCY' || mode === 'DEGRADED') && (
          <button 
            onClick={onRetry}
            className={`ml-2 px-3 py-1 rounded-full text-[9px] font-black uppercase border transition-all hover:brightness-125 active:scale-95 flex items-center gap-1 ${config.text} ${config.border} bg-white/5`}
          >
            <RefreshCw className={`w-3 h-3 ${mode === 'EMERGENCY' ? 'animate-pulse' : ''}`} /> 
            {mode === 'EMERGENCY' ? 'RECONNECT NOW' : 'SYNC'}
          </button>
        )}
      </div>
    </div>
  );
};
