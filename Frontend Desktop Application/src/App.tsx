import { useState, useEffect } from "react";
import { Shield, Loader2, AlertCircle, Sun, Moon, CheckCircle2, ShieldAlert, RefreshCw } from "lucide-react";
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
import api from "./api";
import { ethers } from "ethers";

type AppState = "role-selection" | "admin-login" | "admin-app" | "notary-login" | "notary-app" | "initialize-system";
type AdminScreen = "dashboard" | "manage-notaries" | "governance" | "system-logs" | "multi-sig" | "settings";
type NotaryScreen = "dashboard" | "pending" | "approved" | "profile" | "request-details" | "governance";

interface CheckItem {
  name: string;
  address: string;
  status: 'pending' | 'ok' | 'fail';
  error?: string;
}

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
}

function DeploymentChecklist({ config }: { config: SystemConfig }) {
  const [checks, setChecks] = useState<CheckItem[]>([
    { name: "Genesis NFT", address: config.contracts.genesisNft, status: 'pending' },
    { name: "Activation Contract", address: config.contracts.genesisActivation, status: 'pending' },
    { name: "Notary Registry", address: config.contracts.notaryRegistry, status: 'pending' },
    { name: "Document Registry", address: config.contracts.documentRegistry, status: 'pending' },
    { name: "NTK Token", address: config.contracts.ntk, status: 'pending' },
  ]);

  useEffect(() => {
    const runChecks = async () => {
      const RPC_URL = config.rpcUrl;
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const newChecks = await Promise.all(checks.map(async (c) => {
        if (!c.address || c.address === "undefined") return { ...c, status: 'fail' as const, error: "Missing address" };
        try {
          const code = await provider.getCode(c.address);
          if (code === "0x" || code === "0x0") throw new Error("No code at address");
          return { ...c, status: 'ok' as const };
        } catch (e: any) {
          return { ...c, status: 'fail' as const, error: e.message };
        }
      }));
      setChecks(newChecks);
    };
    runChecks();
  }, []);

  return (
    <div className="space-y-3">
      {checks.map(c => (
        <div 
          key={c.name} 
          className="flex items-center justify-between p-3 rounded-xl transition-colors group"
          style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.05)' 
          }}
        >
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
              {c.name}
            </span>
            <span className="text-[10px] font-mono text-slate-500 group-hover:text-emerald-500/50 transition-colors uppercase">
              {c.address?.slice(0, 10)}...{c.address?.slice(-8)}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {c.status === 'pending' && (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)' }}
              >
                <Loader2 size={12} className="animate-spin text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Scanning</span>
              </div>
            )}
            {c.status === 'ok' && (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.2)' }}
              >
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">Verified</span>
              </div>
            )}
            {c.status === 'fail' && (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.2)' }}
                title={c.error}
              >
                <ShieldAlert size={12} className="text-red-400" />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">Fault</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useConfig } from "./contexts/ConfigAuthority";

export default function App() {
  const { config } = useConfig();
  const [appState, setAppState] = useState<AppState>("role-selection");
  const [adminScreen, setAdminScreen] = useState<AdminScreen>("dashboard");
  const [notaryScreen, setNotaryScreen] = useState<NotaryScreen>("dashboard");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isRecovering, setIsRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isSystemActivated, setIsSystemActivated] = useState<boolean | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("bbsns_dark_mode");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("bbsns_dark_mode", isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => {
    // Reset URL to clean state
    if (window.location.pathname !== "/") {
      window.history.replaceState(null, "", "/");
    }

    if (config) {
      recoverSession();
    }
  }, [config]);

  const recoverSession = async () => {
    console.log("[SESSION] Initializing recovery flow...");
    try {
      // 1. Check System Activation Status
      const status = await api.request("/api/auth/system-status");
      const { activated } = status;
      setIsSystemActivated(activated);

      if (!activated) {
        setAppState("initialize-system");
        setIsRecovering(false);
        return;
      }

      // 2. Attempt Session Recovery if token exists
      const token = localStorage.getItem("bbsns_token");
      if (!token) {
        setIsRecovering(false);
        return;
      }

      const userData = await api.getMe();
      const ROLE_MAP: Record<string | number, string> = {
        1: 'owner', 2: 'notary', 3: 'admin',
        'admin': 'admin', 'notary': 'notary', 'owner': 'owner'
      };

      const normalizedRole = ROLE_MAP[userData.role] || (userData.role && typeof userData.role === 'string' ? userData.role.toLowerCase() : "none");
      setUser({ ...userData, role: normalizedRole });

      if (normalizedRole === "admin") {
        setAppState("admin-app");
      } else if (normalizedRole === "notary") {
        setAppState("notary-app");
      }
      
      pollAlerts();
    } catch (err: any) {
      console.error("[SESSION] Recovery Error:", err.message);
      if (err.status === 401 || err.status === 403) {
        localStorage.removeItem("bbsns_token");
      }
      setRecoveryError(err.message);
    }
    setIsRecovering(false);
  };

  const pollAlerts = async () => {
    try {
      const { count } = await api.getGovernanceAlertCount();
      setAlertCount(count);
    } catch (err) {
      console.warn("[ALERTS] Failed to poll counts");
    }
  };

  const handleRoleSelect = (role: "admin" | "notary") => {
    setRecoveryError(null);
    setAppState(role === "admin" ? "admin-login" : "notary-login");
  };

  const handleAdminLogin = async () => {
    const userData = await api.getMe();
    setUser(userData);
    setAppState("admin-app");
    setAdminScreen("dashboard");
  };

  const handleNotaryLogin = async () => {
    const userData = await api.getMe();
    setUser(userData);
    setAppState("notary-app");
    setNotaryScreen("dashboard");
  };

  const handleLogoutConfirm = () => {
    localStorage.removeItem("bbsns_token");
    setLogoutDialogOpen(false);
    setAppState("role-selection");
    setUser(null);
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0a0d14] border border-red-500/20 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white italic">System Offline</h1>
          <p className="text-slate-400 text-sm leading-relaxed">{configError}</p>
          <Button onClick={() => window.location.reload()} className="w-full bg-red-500 hover:bg-red-600 font-bold py-6 rounded-xl transition-all">
            <RefreshCw className="mr-2 h-4 w-4" /> Reconnect Protocol
          </Button>
        </div>
      </div>
    );
  }

  if (isRecovering || !config) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase">Decrypting Config...</p>
        </div>
      </div>
    );
  }

  if (appState === "initialize-system") {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05),transparent_70%)]" />
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-emerald-500/10 shadow-xl">
                <Shield className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-5xl font-black text-white tracking-tighter italic">SECURITY<br /><span className="text-emerald-500">INITIATION</span></h1>
              <p className="text-slate-400 leading-relaxed max-w-sm">The BBSNS protocol requires cryptographic activation. A Genesis Admin must initiate the root of trust.</p>
            </div>
            <DeploymentChecklist config={config} />
          </div>
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-8 rounded-[32px] shadow-2xl space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Genesis Controller</h3>
              <p className="text-slate-500 text-sm italic">Authorize activation via secure portal</p>
            </div>
            <Button 
              className="w-full h-20 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xl rounded-2xl border-b-8 border-emerald-800 shadow-emerald-900/40 shadow-2xl transition-all"
              onClick={() => {
                const url = "http://localhost:3002/?mode=genesis";
                (window as any).electronAPI ? (window as any).electronAPI.openExternal(url) : window.open(url, '_blank');
              }}
            >
              LAUNCH COMMAND CENTER
            </Button>
            <Button 
               variant="ghost" 
               className="w-full text-slate-500 hover:text-white"
               onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 w-4 h-4 opacity-50" /> Sync System Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if ((appState as any) === "role-selection") {
    return (
      <div className="relative">
        <RoleSelection onSelectRole={handleRoleSelect} />
        {recoveryError && (
          <div className="absolute top-4 right-4 bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>Connection Error: {recoveryError}</span>
            <button onClick={() => setRecoveryError(null)} className="ml-2">×</button>
          </div>
        )}
      </div>
    );
  }

  if ((appState as any) === "admin-login") return <AdminLogin onLogin={handleAdminLogin} onBack={() => setAppState("role-selection")} />;
  if ((appState as any) === "notary-login") return <NotaryLogin onLogin={handleNotaryLogin} onBack={() => setAppState("role-selection")} />;

  if (appState === "admin-app") {
    return (
      <div className="flex h-screen bg-[#07090e]">
        <Sidebar
          role="admin" user={user} activeScreen={adminScreen}
          onNavigate={(s) => setAdminScreen(s as AdminScreen)}
          onLogout={() => setLogoutDialogOpen(true)}
          alertCount={alertCount} isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
        <main className="flex-1 overflow-auto">
          {adminScreen === "dashboard" && <AdminDashboard onNavigate={(s) => setAdminScreen(s as AdminScreen)} isDarkMode={isDarkMode} />}
          {adminScreen === "manage-notaries" && <ManageNotaries />}
          {adminScreen === "governance" && <Governance role="admin" user={user} />}
          {adminScreen === "system-logs" && <SystemLogs />}
          {adminScreen === "multi-sig" && <MultiSigApprovals />}
          {adminScreen === "settings" && <Settings />}
        </main>
        <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
          <DialogContent className="bg-slate-900 border-white/5 text-white rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black italic">TERMINATE SESSION?</DialogTitle>
              <DialogDescription className="text-slate-400">Security tokens will be purged from the local environment.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleLogoutConfirm} className="bg-red-500 hover:bg-red-600 rounded-xl font-bold">Log Out</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (appState === "notary-app") {
    return (
      <div className="flex h-screen bg-[#07090e]">
        <Sidebar
          role="notary" user={user} activeScreen={notaryScreen}
          onNavigate={(s) => setNotaryScreen(s as NotaryScreen)}
          onLogout={() => setLogoutDialogOpen(true)}
          alertCount={alertCount} isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
        <main className="flex-1 overflow-auto">
          {notaryScreen === "dashboard" && <NotaryDashboard onViewRequest={(id) => { setSelectedRequestId(String(id)); setNotaryScreen("request-details"); }} />}
          {notaryScreen === "request-details" && selectedRequestId && <RequestDetails requestId={selectedRequestId} onBack={() => { setNotaryScreen("dashboard"); setSelectedRequestId(null); }} />}
          {notaryScreen === "governance" && <Governance role="notary" user={user} />}
          {notaryScreen === "profile" && <Profile user={user} />}
        </main>
        <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
          <DialogContent className="bg-slate-900 border-white/5 text-white rounded-3xl">
            <DialogHeader><DialogTitle>Confirm Logout</DialogTitle></DialogHeader>
            <DialogFooter><Button onClick={handleLogoutConfirm} className="bg-red-500">Logout</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
