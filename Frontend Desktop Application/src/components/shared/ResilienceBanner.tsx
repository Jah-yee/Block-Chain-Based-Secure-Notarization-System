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
    <div className={`fixed top-0 left-0 w-full z-[10000] border-b ${config.bg} ${config.border} backdrop-blur-md px-4 py-2 flex items-center justify-center gap-3 shadow-lg animate-in slide-in-from-top duration-300`}>
      <div className={config.text}>{config.icon}</div>
      <span className={`text-[11px] font-bold uppercase tracking-wider ${config.text}`}>
        {config.message}
      </span>
      {(mode === 'STALE' || mode === 'EMERGENCY') && (
        <button 
          onClick={onRetry}
          className={`ml-2 px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all hover:scale-105 active:scale-95 flex items-center gap-1 ${config.text} ${config.border}`}
        >
          <RefreshCw className="w-3 h-3" /> Reconnect
        </button>
      )}
    </div>
  );
};
