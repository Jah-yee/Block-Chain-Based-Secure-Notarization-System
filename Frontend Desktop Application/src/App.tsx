import { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield, Loader2, AlertCircle, Sun, Moon, CheckCircle2,
  ShieldAlert, RefreshCw, WifiOff, Copy, ExternalLink,
  Info, AlertTriangle, CheckCircle, Lock, Clock
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

  const checks = [
    { name: "Registry NFT", address: config.contracts.genesisNft },
    { name: "Activation Hook", address: config.contracts.genesisActivation },
    { name: "Notary Database", address: config.contracts.notaryRegistry },
    { name: "Document Vault", address: config.contracts.documentRegistry },
    { name: "Protocol Token", address: config.contracts.ntk },
  ].map(check => ({
    ...check,
    status: check.address ? "Confirmed" : "Pending"
  }));

  const truncate = (addr: string) => addr ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : "UNASSIGNED";

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="w-full">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="px-4 py-8 text-[11px] font-black text-slate-700 uppercase tracking-[0.5em]">Resource Name</th>
            <th className="px-4 py-8 text-[11px] font-black text-slate-700 uppercase tracking-[0.5em]">
              <div className="flex items-center gap-2">
                Network Identity <Info size={14} className="text-slate-800" />
              </div>
            </th>
            <th className="px-4 py-8 text-[11px] font-black text-slate-700 uppercase tracking-[0.5em] text-right">State</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check, idx) => (
            <tr key={idx} className="hover:bg-white/[0.01] transition-all group">
              <td className="px-4 py-8">
                <span className="text-[14px] font-black text-slate-300 uppercase tracking-tight">{check.name}</span>
              </td>
              <td className="px-4 py-8">
                <div className="flex items-center gap-6">
                  <code className="text-[14px] text-slate-500 font-mono tracking-[0.1em] group-hover:text-blue-400 transition-colors">
                    {truncate(check.address)}
                  </code>
                  {check.address && (
                    <button
                      onClick={() => copyToClipboard(check.address)}
                      className="p-2 text-slate-700 hover:text-white hover:bg-white/5 rounded-xl transition-all relative"
                    >
                      {copied === check.address ? <CheckCircle size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-4 py-8 text-right">
                <div className={`inline-flex items-center gap-3 text-[11px] font-black tracking-[0.2em] ${check.status === 'Confirmed'
                    ? 'text-emerald-500'
                    : 'text-slate-700'
                  }`}>
                  {check.status === 'Confirmed' && <CheckCircle2 size={16} />}
                  <span className="uppercase">{check.status}</span>
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
      if (systemStatus) {
        const canProceed = systemStatus.activated === true || systemStatus.hasUsers === true;
        if (!canProceed) {
          setAppState("initialize-system");
          setIsRecovering(false);
          return;
        }
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
        <div className="flex-1 flex overflow-hidden bg-[#020408] p-12 gap-12 justify-center">
          <div className="flex w-full max-w-[1400px] gap-12 h-full">
            {/* 🕹️ LEFT: STATUS SIDEBAR */}
            <aside className="w-[400px] bg-[#0f172a] rounded-[4rem] flex flex-col p-16 shrink-0 shadow-2xl border border-white/5">
              <div className="flex flex-col h-full">
                {/* 🛡️ System Identity */}
                <div className="flex items-center gap-7 mb-24">
                  <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.3)]">
                    <Shield className="w-10 h-10 text-white" />
                  </div>
                  <div className="space-y-1">
                    <h1 className="text-[22px] font-black text-white tracking-tight leading-none uppercase">Security Suite</h1>
                    <p className="text-[14px] font-bold text-slate-500 uppercase tracking-widest">Genesis Controller</p>
                  </div>
                </div>

                {/* 📝 Deployment Stepper (High Spacing) */}
                <div className="flex-1 flex flex-col min-h-0 pt-10">
                  <div className="mb-16">
                    <p className="text-[12px] font-black text-slate-600 uppercase tracking-[0.4em] mb-6">Network Node</p>
                    <div className="bg-black/40 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between shadow-inner">
                      <span className="text-[14px] text-blue-400 font-mono font-black tracking-widest uppercase">ID: {config.chainId}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                        <span className="text-[11px] font-black text-emerald-500 uppercase tracking-tighter">Synced</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                    <p className="text-[12px] font-black text-slate-600 uppercase tracking-[0.4em] mb-10">Initialization Phase</p>
                    <div className="space-y-0 relative">
                      <div className="absolute left-[23px] top-5 bottom-5 w-0.5 bg-white/5" />
                      {[
                        { id: 1, t: "Registry Synthesis", state: "done" },
                        { id: 2, t: "Gateway Connection", state: "active" },
                        { id: 3, t: "Genesis Sign-Off", state: "pending" }
                      ].map((phase, i) => (
                        <div key={i} className="flex gap-12 pb-20 relative last:pb-0">
                          <div className="relative z-10">
                             <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-[13px] font-black transition-all duration-500 ${
                               phase.state === 'done' ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]' :
                               phase.state === 'active' ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_50px_rgba(37,99,235,0.6)]' :
                               'bg-[#020408] border-white/10 text-slate-800'
                             }`}>
                               {phase.state === 'done' ? <CheckCircle2 size={24} /> : phase.id}
                             </div>
                          </div>
                          <div className="flex flex-col pt-2">
                            <p className={`text-[16px] font-black tracking-tight uppercase ${phase.state === 'pending' ? 'text-slate-800' : 'text-white'}`}>{phase.t}</p>
                            {phase.state === 'active' && <span className="text-[11px] font-black text-blue-500 uppercase tracking-[0.2em] mt-3 animate-pulse">Awaiting Signature</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* 📊 RIGHT: INTEGRATED WORKSPACE */}
            <main className="flex-1 flex flex-col min-w-0 py-8 justify-between h-full">
              <div className="flex flex-col gap-16">
                {/* 🏆 Refined Header */}
                <div className="flex items-center justify-between px-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-blue-500 font-black uppercase text-[12px] tracking-[0.5em]">
                       <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse shadow-[0_0_20px_rgba(37,99,235,0.5)]" />
                       Root Identity Verified
                    </div>
                    <h2 className="text-[48px] font-black text-white tracking-tighter uppercase leading-none">Resource Dashboard</h2>
                  </div>
                  
                  <div className="flex items-center gap-8">
                     {[
                       { l: "Authority Hash", v: "Verified", c: "text-blue-500", bg: "bg-blue-500/5" },
                       { l: "Network Sync", v: "Stabilized", c: "text-emerald-500", bg: "bg-emerald-500/5" }
                     ].map((stat, i) => (
                       <div key={i} className={`flex flex-col gap-2 px-10 py-6 rounded-[2rem] border border-white/5 ${stat.bg}`}>
                           <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">{stat.l}</span>
                           <span className={`text-[18px] font-black uppercase tracking-[0.2em] ${stat.c}`}>{stat.v}</span>
                       </div>
                     ))}
                  </div>
                </div>

                {/* 🛠️ Registry Table Area */}
                <div className="flex flex-col px-4">
                   <div className="flex flex-col items-center gap-4 mb-12">
                      <h3 className="text-[14px] font-black text-slate-500 uppercase tracking-[0.6em]">Registry Module Integrity</h3>
                      <div className="w-20 h-1.5 bg-blue-600/30 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.2)]" />
                   </div>
                   <div className="max-h-[380px] overflow-y-auto custom-scrollbar bg-black/20 rounded-[3rem] border border-white/5 p-8 shadow-2xl">
                      <DeploymentChecklist config={config} />
                   </div>
                </div>
              </div>

              {/* ⚡ PRIMARY ACTION: HIGH VISIBILITY COMMAND */}
              <div className="flex flex-col items-center gap-10 pb-10">
                 <button 
                   onClick={() => {
                     if (!config) return;
                     const url = `${config.remoteAuthUrl.replace(/\/$/, "")}/?mode=genesis`;
                     (window as any).electronAPI ? (window as any).electronAPI.openExternal(url) : window.open(url, '_blank');
                   }}
                   style={{ backgroundColor: '#2563eb', borderRadius: '60px' }}
                   className="group relative flex items-center gap-10 text-white px-24 py-10 transition-all duration-500 shadow-[0_20px_100px_rgba(37,99,235,0.6)] hover:shadow-[0_40px_150px_rgba(37,99,235,0.8)] hover:-translate-y-2 active:scale-[0.98] border-2 border-white/30 ring-4 ring-blue-400/50 cursor-pointer overflow-hidden"
                 >
                   <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20 opacity-100" />
                   <div className="w-20 h-20 bg-white/20 rounded-[1.8rem] flex items-center justify-center border border-white/40 shrink-0 shadow-inner group-hover:scale-110 transition-transform relative z-10">
                     <Lock size={36} className="text-white drop-shadow-md" />
                   </div>
                   <div className="text-left relative z-20">
                     <p className="text-[24px] font-black uppercase leading-none mb-2 tracking-tight drop-shadow-sm">Authorize Console</p>
                     <p className="text-[14px] text-white/90 font-bold tracking-wider">Initialize secure protocol handshake</p>
                   </div>
                 </button>

                 <div className="flex items-center justify-center gap-5 text-slate-800">
                    <Info size={18} />
                    <p className="text-[12px] font-black uppercase tracking-[0.4em]">
                      Manual Genesis Authorization Required for System Unlock
                    </p>
                 </div>
              </div>
            </main>
          </div>
        </div>
      )}

        {appState === "role-selection" && <RoleSelection onSelectRole={(role) => setAppState(role === "admin" ? "admin-login" : "notary-login")} />}
        {appState === "admin-login" && <AdminLogin onLogin={recoverSession} onBack={() => setAppState("role-selection")} />}
        {appState === "notary-login" && <NotaryLogin onLogin={recoverSession} onBack={() => setAppState("role-selection")} />}

        {appState === "admin-app" && (
          <div className="flex-1 flex min-h-0">
            <Sidebar role="admin" user={user} activeScreen={adminScreen} onNavigate={(s) => setAdminScreen(s as AdminScreen)} onLogout={() => setLogoutDialogOpen(true)} alertCount={alertCount} isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
            <main className="flex-1 bg-background overflow-hidden flex flex-col">
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
              {notaryScreen === "approved" && <NotaryDashboard filterStatus="approved" onViewRequest={(id) => { setSelectedRequestId(String(id)); setNotaryScreen("request-details"); }} />}
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
          <DialogHeader><DialogTitle className="text-xl font-bold uppercase">Terminate Session?</DialogTitle></DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogoutConfirm} className="bg-red-500 hover:bg-red-600 font-bold">Log Out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
