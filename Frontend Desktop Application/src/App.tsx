import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Loader2, AlertCircle, Sun, Moon, CheckCircle2,
  ShieldAlert, RefreshCw, WifiOff, Copy, ExternalLink,
  Info, AlertTriangle, CheckCircle, Lock, Clock, ArrowRight
} from "lucide-react";
import { RoleSelection } from "./components/RoleSelection";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { ManageNotaries } from "./components/admin/ManageNotaries";
import { SystemLogs } from "./components/admin/SystemLogs";
import { MultiSigApprovals } from "./components/admin/MultiSigApprovals";
import { Settings } from "./components/admin/Settings";
import { Governance } from "./components/admin/Governance";
import { NotaryLogin } from "./components/notary/NotaryLogin";
import { NotaryDashboard } from "./components/notary/NotaryDashboard";
import { RequestDetails } from "./components/notary/RequestDetails";
import { Profile } from "./components/notary/Profile";
import { Sidebar } from "./components/shared/Sidebar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { useConfig } from "./contexts/ConfigAuthority";
import { ResilienceBanner } from "./components/shared/ResilienceBanner";
import { TitleBar } from "./components/shared/TitleBar";
import api from "./services/api";
import { ethers } from "ethers";
import JourneyBox from "./components/journey/JourneyBox";
import JourneyErrorBoundary from "./components/shared/ErrorBoundary";

type AppState = "role-selection" | "admin-login" | "admin-app" | "notary-login" | "notary-app" | "owner-app" | "initialize-system";
type AdminScreen = "dashboard" | "manage-notaries" | "governance" | "system-logs" | "multi-sig" | "settings";
type NotaryScreen = "dashboard" | "pending" | "approved" | "profile" | "request-details" | "governance";

interface SystemConfig {
  rpcUrl: string;
  chainId: number;
  contracts: {
    notaryRegistry: string;
    documentRegistry: string;
    ntkr: string;
    ntk: string;
    genesisActivation: string;
    genesisNft: string;
    multisig: string;
  };
  remoteAuthUrl: string;
  apiBaseUrl: string;
}

function DeploymentChecklist({ config }: { config: SystemConfig }) {
  const [copied, setCopied] = useState<string | null>(null);

  // Map contract keys to readable labels dynamically
  const labelMap: Record<string, string> = {
    genesisNft: "Registry Authority",
    genesisActivation: "Activation Hook",
    notaryRegistry: "Notary Ledger",
    documentRegistry: "Document Vault",
    ntk: "Protocol Token",
    ntkr: "Reputation Engine",
    multisig: "Governance MultiSig"
  };

  const checks = Object.entries(config.contracts).map(([key, address]) => ({
    name: labelMap[key] || key.replace(/([A-Z])/g, ' $1').trim(),
    address,
    status: address && address !== "0x0000000000000000000000000000000000000000" ? "Confirmed" : "Pending"
  }));

  const truncate = (addr: string) => addr ? `${addr.slice(0, 14)}...${addr.slice(-12)}` : "NOT_DEPLOYED";

  const copyToClipboard = (text: string) => {
    if (!text || text === "0x0000000000000000000000000000000000000000") return;
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="w-full">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#1e2433]">
            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Resource Module</th>
            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Verification State</th>
            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Contract Address</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check, idx) => (
            <tr key={idx} className={`border-b border-[#12151c] hover:bg-white/[0.03] transition-colors group ${idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'}`}>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-1 h-8 rounded-full ${check.status === 'Confirmed' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                  <span className="text-[13px] font-semibold text-slate-200">{check.name}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                  check.status === 'Confirmed' 
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-slate-800/60 text-slate-500 border border-slate-700/60'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${check.status === 'Confirmed' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {check.status}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <code className="text-[11px] text-slate-400 font-mono bg-[#0d0f14] px-3 py-1.5 rounded-lg border border-[#1e2433]">
                    {truncate(check.address)}
                  </code>
                  {check.address && check.address !== "0x0000000000000000000000000000000000000000" && (
                    <button
                      onClick={() => copyToClipboard(check.address)}
                      className="p-1.5 text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Copy full address"
                    >
                      {copied === check.address ? <CheckCircle size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const { config, status, mode, syncStep, retryCount, error: configError, retry } = useConfig();
  const [appState, setAppState] = useState<AppState>("role-selection");
  const [adminScreen, setAdminScreen] = useState<AdminScreen>("dashboard");
  const [notaryScreen, setNotaryScreen] = useState<NotaryScreen>("dashboard");
  const [previousNotaryScreen, setPreviousNotaryScreen] = useState<NotaryScreen>("dashboard");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isRecovering, setIsRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("bbsns_dark_mode");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const hasInitiatedRecovery = useRef(false);

  const recoverSession = useCallback(async () => {
    console.log("[SESSION] Initializing resilient recovery flow...");
    try {
      const systemStatus = await api.request("/api/auth/system-status");
      console.log("[STARTUP] System Status:", systemStatus);

      const canProceed = systemStatus.activated === true && systemStatus.hasUsers === true;

      if (!canProceed) {
          console.log("[STARTUP] System not initialized. Redirecting to Genesis...");
          // 🛡️ [HARDENING] Clear any stale session data if system is uninitialized
          if (typeof window !== 'undefined' && (window as any).electronAPI) {
              await (window as any).electronAPI.auth.logout();
          }
          setAppState("initialize-system");
          setIsRecovering(false);
          return;
      }

      const session = await (window as any).electronAPI.auth.getSession();
      if (session && session.authenticated) {
        const u = session.user || {};
        const rRaw = u.role;
        const role = (rRaw === 3 || String(rRaw).toLowerCase() === 'admin') ? 'admin' : 
                     (rRaw === 2 || String(rRaw).toLowerCase() === 'notary') ? 'notary' : 'owner';
        setUser({ ...u, role });
        if (role === 'admin') setAppState("admin-app");
        else if (role === 'notary') setAppState("notary-app");
        else setAppState("owner-app");
      }
    } catch (err) {
      console.error("[SESSION] Recovery failed:", err);
    } finally {
      setIsRecovering(false);
    }
  }, []);

  useEffect(() => {
    if (config && !hasInitiatedRecovery.current) {
      api.setBaseUrl(config.apiBaseUrl);
      hasInitiatedRecovery.current = true;
      recoverSession();
    }
  }, [config, recoverSession]);

  useEffect(() => {
    const root = window.document.documentElement;
    isDarkMode ? root.classList.add("dark") : root.classList.remove("dark");
    localStorage.setItem("bbsns_dark_mode", isDarkMode.toString());
  }, [isDarkMode]);

  const handleLogoutConfirm = async () => {
    await (window as any).electronAPI.auth.logout();
    setLogoutDialogOpen(false);
    setAppState("role-selection");
    setUser(null);
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/20 rounded-xl p-8 text-center space-y-6">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-white uppercase">Authority Error</h1>
          <p className="text-slate-400 text-sm">{configError.message}</p>
          <Button onClick={retry} className="w-full bg-slate-800">Retry Connection</Button>
        </div>
      </div>
    );
  }

  if (isRecovering || !config || status === 'loading') {
    const progressMap = {
      'IDLE': 10,
      'HANDSHAKE': 25,
      'INTEGRITY': 50,
      'PERSISTENCE': 75,
      'FINALIZING': 100
    };
    const currentProgress = progressMap[syncStep] || 10;
    
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center font-sans overflow-hidden relative">
        {/* Animated Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        
        <div className="max-w-md w-full p-12 relative z-10 flex flex-col items-center gap-10">
          {/* Central Logo/Icon */}
          <div className="relative group">
            <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full opacity-50 animate-pulse" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl border border-white/20 transform hover:rotate-12 transition-transform duration-700">
              <Shield className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic leading-none">Initializing BBSNS</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Establishing Secure Authority Handshake</p>
          </div>

          {/* Engaging Progress Bar */}
          <div className="w-full space-y-4">
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
               <div 
                 className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 transition-all duration-700 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]" 
                 style={{ width: `${currentProgress}%` }}
               />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Handshaking", status: syncStep === 'HANDSHAKE' ? `Attempt ${retryCount}/5` : (progressMap[syncStep] > 25 ? 'Complete' : 'Waiting') },
                { label: "Integrity", status: syncStep === 'INTEGRITY' ? 'Active' : (progressMap[syncStep] > 50 ? 'Complete' : 'Waiting') }
              ].map((step, i) => (
                <div key={i} className={`bg-white/5 border rounded-2xl p-4 flex flex-col gap-1 transition-all duration-500 ${step.status.includes('Attempt') || step.status === 'Active' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/[0.03]'}`}>
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{step.label}</span>
                  <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${step.status.includes('Attempt') || step.status === 'Active' ? 'text-emerald-500 animate-pulse' : (step.status === 'Complete' ? 'text-blue-400' : 'text-slate-700')}`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-700">
             <RefreshCw size={14} className="animate-spin" />
             <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Syncing with Authority...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#020617] text-white overflow-hidden select-none font-sans">
      <div className="flex-none border-b border-white/5">
        <TitleBar user={user} onRetry={() => { retry(); recoverSession(); }} />
      </div>
      
      <div className="flex-1 overflow-hidden flex flex-col">
        {appState === "initialize-system" && (
          <div className="flex-1 bg-[#080b12] flex font-sans overflow-hidden">
            <aside className="w-72 border-r border-[#1a1f2e] bg-[#0c0f18] p-8 flex flex-col gap-0 shrink-0">
              {/* Brand — top section */}
              <div className="flex items-center gap-3 pb-7">
                <div className="w-11 h-11 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                  <Shield size={22} className="text-blue-400" />
                </div>
                <div>
                  <h1 className="text-[13px] font-black text-white tracking-wider uppercase leading-none">Security Suite</h1>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Genesis Controller</p>
                </div>
              </div>

              {/* Hard separator */}
              <div className="h-px bg-[#1a1f2e] mb-7" />

              {/* Network Status Card */}
              <div className="bg-[#111520] rounded-xl p-4 border border-[#1e2436] mb-7">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Network</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">Live</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chain ID</span>
                  <span className="text-[24px] font-black text-white font-mono leading-none">{config?.chainId}</span>
                </div>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-2">BBSNS Genesis Root</p>
              </div>

              {/* Hard separator */}
              <div className="h-px bg-[#1a1f2e] mb-7" />

              {/* Sequence Steps */}
              <div className="flex-1 flex flex-col gap-7">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Initialization Sequence</p>
                <div className="flex flex-col gap-6">
                  {/* Step 1: Done */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0"
                      style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.5)', color: '#34d399' }}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>Registry Synthesis</p>
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: '#10b981' }}>Confirmed</p>
                    </div>
                  </div>
                  {/* Step 2: Active */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0"
                      style={{ backgroundColor: 'rgba(37,99,235,0.2)', borderColor: 'rgba(59,130,246,0.5)', color: '#60a5fa' }}>
                      <span className="text-[12px] font-black">2</span>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>Gateway Connection</p>
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: '#60a5fa' }}>Awaiting Signature</p>
                    </div>
                  </div>
                  {/* Step 3: Locked */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0"
                      style={{ backgroundColor: '#111520', borderColor: '#252d40', color: '#475569' }}>
                      <span className="text-[12px] font-black">3</span>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#475569' }}>Genesis Sign-Off</p>
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: '#334155' }}>Locked</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hard separator */}
              <div className="h-px bg-[#1a1f2e] mt-7 mb-7" />

              {/* Protocol Note */}
              <div className="p-4 bg-[#111520] border border-[#1e2436] rounded-xl">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Protocol Note</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Establish Root of Trust via the Genesis Authority Hook.
                </p>
              </div>
            </aside>

            {/* MAIN WORKSPACE */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#080b12]">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-10 lg:p-14">
                <div className="max-w-5xl mx-auto flex flex-col gap-10">

                  {/* HEADER */}
                  <header className="flex flex-col gap-10 pb-10 border-b border-[#1a1f2e]">
                    {/* Title Row */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-blue-400 text-[10px] font-bold uppercase tracking-[0.5em] no-underline">Network Identity Authenticated</span>
                      </div>
                      <h2 className="text-5xl font-black text-white tracking-tight uppercase leading-none">
                        Genesis Console
                      </h2>
                      <p className="text-[13px] text-slate-500 font-normal">
                        Blockchain registry verification and initialization dashboard
                      </p>
                    </div>
                    {/* Stats Row — hardcoded, not dynamic (prevents Tailwind purge) */}
                    <div className="grid grid-cols-3 gap-4">
                      {/* Authority Hash */}
                      <div className="px-5 py-4 rounded-xl flex flex-col gap-2"
                        style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Authority Hash</span>
                        <span className="text-[16px] font-black" style={{ color: '#34d399' }}>Verified</span>
                      </div>
                      {/* Network Sync */}
                      <div className="px-5 py-4 rounded-xl flex flex-col gap-2"
                        style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Network Sync</span>
                        <span className="text-[16px] font-black" style={{ color: '#60a5fa' }}>Stabilized</span>
                      </div>
                      {/* Chain ID */}
                      <div className="px-5 py-4 rounded-xl flex flex-col gap-2"
                        style={{ backgroundColor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Chain ID</span>
                        <span className="text-[16px] font-black" style={{ color: '#a78bfa' }}>{config?.chainId || '—'}</span>
                      </div>
                    </div>
                  </header>

                  {/* REGISTRY TABLE */}
                  <section className="flex flex-col gap-5">
                    <div className="flex items-center gap-4">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.5em] whitespace-nowrap">Registry Integrity Audit</h3>
                      <div className="h-px flex-1 bg-[#1a1f2e]" />
                    </div>
                    <div className="bg-[#0c0f18] rounded-2xl border border-[#1a1f2e] overflow-hidden">
                      <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                        <DeploymentChecklist config={config} />
                      </div>
                    </div>
                  </section>

                  {/* ACTION PANEL — dark navy bg so blue button is unmistakably a button */}
                  <section className="flex flex-col gap-4">
                    <div className="bg-[#0c0f18] border border-[#1e2436] rounded-2xl p-8 flex flex-col lg:flex-row items-center justify-between gap-8">
                      {/* Left side: info */}
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-[#111520] rounded-xl flex items-center justify-center border border-[#1e2436] shrink-0">
                          <Lock size={26} className="text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[20px] font-black text-white uppercase tracking-tight leading-none">Authorize Console</p>
                          <p className="text-[12px] text-slate-400 font-normal mt-2">
                            Genesis Handshake Protocol — Initialization Required
                          </p>
                        </div>
                      </div>

                      {/* Right side: clearly differentiated button — inline style to bypass CSS purge */}
                      <button
                        onClick={() => {
                          if (!config) return;
                          const url = `${config.remoteAuthUrl.replace(/\/$/, "")}/?mode=genesis`;
                          (window as any).electronAPI ? (window as any).electronAPI.openExternal(url) : window.open(url, '_blank');
                        }}
                        style={{
                          backgroundColor: '#2563eb',
                          boxShadow: '0 4px 24px rgba(37,99,235,0.45)',
                          border: '1px solid rgba(96,165,250,0.4)'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2563eb')}
                        className="w-full lg:w-auto flex items-center justify-center gap-3 text-white px-10 py-4 rounded-xl font-black uppercase text-[13px] tracking-widest transition-colors duration-200 cursor-pointer"
                      >
                        <Lock size={15} />
                        Launch Initialization
                        <ArrowRight size={15} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 justify-center py-1">
                      <Info size={13} className="text-slate-700 shrink-0" />
                      <p className="text-[11px] text-slate-600 uppercase tracking-[0.3em]">
                        Manual Genesis Authorization Required
                      </p>
                    </div>
                  </section>
                </div>
              </div>
            </main>
          </div>
        )}

        {appState === "role-selection" && (
          <RoleSelection onSelectRole={(role) => setAppState(role === "admin" ? "admin-login" : "notary-login")} />
        )}
        
        {appState === "admin-login" && (
          <AdminLogin onLogin={recoverSession} onBack={() => setAppState("role-selection")} />
        )}

        {appState === "notary-login" && (
          <NotaryLogin onLogin={recoverSession} onBack={() => setAppState("role-selection")} />
        )}

        {appState === "admin-app" && (
          <div className="flex-1 flex min-h-0 h-full overflow-hidden">
            <Sidebar role="admin" user={user} activeScreen={adminScreen} onNavigate={(s) => setAdminScreen(s as AdminScreen)} onLogout={() => setLogoutDialogOpen(true)} alertCount={alertCount} isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
            <main className="flex-1 bg-background flex flex-col h-full min-h-0 min-w-0">
              {adminScreen === "dashboard" && <AdminDashboard onNavigate={(s) => setAdminScreen(s as AdminScreen)} isDarkMode={isDarkMode} user={user} />}
              {adminScreen === "manage-notaries" && <ManageNotaries />}
              {adminScreen === "governance" && <Governance role="admin" user={user} />}
              {adminScreen === "system-logs" && <SystemLogs />}
              {adminScreen === "multi-sig" && <MultiSigApprovals />}
              {adminScreen === "settings" && <Settings />}
            </main>
          </div>
        )}

        {appState === "notary-app" && (
          <div className="flex-1 flex overflow-hidden min-h-0 bg-background">
            <Sidebar role="notary" user={user} activeScreen={notaryScreen} onNavigate={(s) => setNotaryScreen(s as NotaryScreen)} onLogout={() => setLogoutDialogOpen(true)} alertCount={alertCount} isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
            <main className="flex-1 bg-background overflow-hidden flex flex-col">
              {notaryScreen === "dashboard" && <NotaryDashboard onViewRequest={(id) => { setSelectedRequestId(String(id)); setNotaryScreen("request-details"); }} />}
              {notaryScreen === "pending" && <NotaryDashboard filterStatus="pending" onViewRequest={(id) => { setSelectedRequestId(String(id)); setNotaryScreen("request-details"); }} />}
              {notaryScreen === "approved" && <NotaryDashboard filterStatus="processed" onViewRequest={(id) => { setSelectedRequestId(String(id)); setNotaryScreen("request-details"); }} />}
              {notaryScreen === "request-details" && selectedRequestId && <RequestDetails requestId={selectedRequestId} onBack={() => { setNotaryScreen("dashboard"); setSelectedRequestId(null); }} />}
              {notaryScreen === "governance" && <Governance role="notary" user={user} />}
              {notaryScreen === "profile" && <Profile user={user} />}
            </main>
          </div>
        )}

        {appState === "owner-app" && (
          <div className="flex-1 flex overflow-hidden min-h-0 bg-background">
            <Sidebar role="owner" user={user} activeScreen="dashboard" onNavigate={() => {}} onLogout={() => setLogoutDialogOpen(true)} alertCount={0} isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
            <main className="flex-1 bg-background p-8 overflow-y-auto custom-scrollbar">
              <JourneyErrorBoundary><JourneyBox /></JourneyErrorBoundary>
            </main>
          </div>
        )}
      </div>


      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase">Terminate Session?</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to log out? Any unsaved changes may be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogoutConfirm} className="bg-red-500 hover:bg-red-600 font-bold">Log Out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
