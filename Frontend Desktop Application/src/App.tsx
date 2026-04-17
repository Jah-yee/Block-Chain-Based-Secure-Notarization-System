import { useState, useEffect, useRef } from "react";
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
import api from "./services/api";
import { ethers } from "ethers";
import JourneyBox from "./components/journey/JourneyBox";
import JourneyErrorBoundary from "./components/shared/ErrorBoundary";

type AppState = "role-selection" | "admin-login" | "admin-app" | "notary-login" | "notary-app" | "owner-app" | "initialize-system";
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
import { ResilienceBanner } from "./components/shared/ResilienceBanner";

export default function App() {
  const { config, status, mode, error: configError, retry } = useConfig();
  const [appState, setAppState] = useState<AppState>("role-selection");
  const [adminScreen, setAdminScreen] = useState<AdminScreen>("dashboard");
  const [notaryScreen, setNotaryScreen] = useState<NotaryScreen>("dashboard");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  console.log('[IPC LISTENER READY]');
  console.log("--- [DEBUG] CHECKPOINT 0: FORENSIC V27.8.20 ---");
  console.log("--- [DEBUG] CHECKPOINT 0: APP V27.8.20 DETECTED ---");
  const [isRecovering, setIsRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isSystemActivated, setIsSystemActivated] = useState<boolean | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const hasInitiatedRecovery = useRef(false);
  
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
    if (window.location.protocol !== "file:" && window.location.pathname !== "/") {
      window.history.replaceState(null, "", "/");
    }

    if (config && !hasInitiatedRecovery.current) {
      console.log("[CONFIG] Applying dynamic authority:", config.apiBaseUrl);
      api.setBaseUrl(config.apiBaseUrl);
      hasInitiatedRecovery.current = true;
      recoverSession();
    }
  }, [config]);



  const recoverSession = async () => {
    console.log("[SESSION] Initializing resilient recovery flow (getSession)...");
    let resolved = false;

    try {
      // 🛡️ [RESILIENCE] Decouple UI from Slow Handshake
      // Race the API call against a 4s hard timeout to prevent UI deadlock
      const timeout = new Promise(resolve => 
        setTimeout(() => {
          if (!resolved) {
            console.warn("[SESSION] Handshake timeout (4s). Using fail-safe fallback.");
            resolve(null);
          }
        }, 4000)
      );

      const apiCall = api.request("/api/auth/system-status").then(res => {
        resolved = true;
        return res;
      });

      const systemStatus = await Promise.race([apiCall, timeout]);

      if (systemStatus) {
        const { activated, hasUsers, isChainUp } = systemStatus;
        setIsSystemActivated(activated);
        
        // ⚖️ [DECISION] Decoupled Logic:
        // Use facts (hasUsers) to allow entry even if blockchain is unreachable
        const canProceed = activated === true || hasUsers === true;

        if (!canProceed) {
          console.log("[SESSION] System not activated and has no users. Redirecting to Genesis.");
          setAppState("initialize-system");
          setIsRecovering(false);
          return;
        }

        if (!isChainUp) {
          console.warn("[SESSION] System reachable but blockchain authority is unreachable (DEGRADED).");
        }
      } else {
        // [TIMEOUT CASE] - Assume activated to avoid blocking Admin/Notary entry
        // If they don't have a session, they'll reach RoleSelection.
        console.warn("[SESSION] Proceeding in degraded mode after status timeout.");
      }

      // 2. Fetch session from main process bridge (Secondary Authority)
      const session = await (window as any).electronAPI.auth.getSession();
      
      if (!session || !session.authenticated) {
        console.log("[SESSION] No authenticated session found in OS vault.");
        setAppState("role-selection");
        setIsRecovering(false);
        return;
      }

      const userProfile = session.user || {};
      const ROLE_MAP: Record<string | number, string> = {
        1: 'owner', 2: 'notary', 3: 'admin',
        'admin': 'admin', 'notary': 'notary', 'owner': 'owner'
      };

      const normalizedRole = ROLE_MAP[userProfile.role] || (userProfile.role && typeof userProfile.role === 'string' ? userProfile.role.toLowerCase() : "none");
      
      setUser({ 
        ...userProfile, 
        role: normalizedRole,
        zeroTrustStatus: session.zeroTrustStatus || 'DEGRADED' 
      });

      if (normalizedRole === "admin") {
        setAppState("admin-app");
      } else if (normalizedRole === "notary") {
        setAppState("notary-app");
      } else if (normalizedRole === "owner") {
        setAppState("owner-app");
      }
      
      pollAlerts();
    } catch (err: any) {
      console.error("[SESSION] Recovery Error:", err.message);
      setRecoveryError(err.message);
      setAppState("role-selection"); // Fallback to allow re-login attempt
    }
    setIsRecovering(false);
  };


  useEffect(() => {
    // 🛡️ [SECURITY] Listen for OS-level auth status changes (Success, Expiry, Force Logout)
    if ((window as any).electronAPI?.auth) {
        (window as any).electronAPI.auth.onStatusChanged((data: any) => {
            // [TRACE 5] IPC Received
            console.log('[STEP 5] IPC_RECEIVED', data);
            
            if (data.status === 'authorized') {
                const userProfile = data.user || {};
                
                // 🛡️ [SECURITY] Hardened Role Mapping (Accepts string or number)
                const ROLE_MAP: Record<string | number, string> = { 
                    1: 'owner', 2: 'notary', 3: 'admin',
                    'admin': 'admin', 'notary': 'notary', 'owner': 'owner'
                };
                const normalizedRole = ROLE_MAP[userProfile.role] || 'none';
                
                const finalState = {
                    appState: normalizedRole === 'admin' ? 'admin-app' : (normalizedRole === 'notary' ? 'notary-app' : (normalizedRole === 'owner' ? 'owner-app' : 'role-selection')),
                    user: { ...userProfile, role: normalizedRole }
                };
                
                // [TRACE 6] UI State Update
                console.log('[STEP 6] APP_STATE_UPDATE', finalState);
                
                setUser({
                    ...finalState.user,
                    zeroTrustStatus: data.zeroTrustStatus || 'VERIFIED'
                });
                setAppState(finalState.appState as any);
                setAdminScreen('dashboard');

            } else if (data.status === 'unauthorized' || data.status === 'expired' || data.status === 'failed') {
                console.warn('[AUTH_FAULT]', data.error || data.status);
                setUser(null);
                setAppState('role-selection');
                setRecoveryError(data.error || (data.status === 'expired' ? 'Session expired. Please re-authenticate.' : null));
            }
            
            // [SELF-HEALING] Clear upgrade state on any status push
            setIsUpgrading(false);
        });
    }
}, []);

  const pollAlerts = async () => {
    try {
      const response = await (window as any).electronAPI.api.call("/api/governance/alerts/count");
      setAlertCount(response.count);
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

  const handleLogoutConfirm = async () => {
    await (window as any).electronAPI.auth.logout();
    setLogoutDialogOpen(false);
    setAppState("role-selection");
    setUser(null);
  };

  if (configError) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0a0d14] border border-red-500/20 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white italic">Protocol Error</h1>
          <p className="text-slate-400 text-sm leading-relaxed">{configError.message}</p>
          <Button onClick={retry} className="w-full bg-red-500 hover:bg-red-600 font-bold py-6 rounded-xl transition-all">
            <RefreshCw className="mr-2 h-4 w-4" /> Reset Authority
          </Button>
        </div>
      </div>
    );
  }

  if (isRecovering || !config) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
        <ResilienceBanner mode={mode} onRetry={retry} />
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase">Decrypting Config...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {user && user.zeroTrustStatus === 'DEGRADED' && (
          <div style={{
            background: 'linear-gradient(90deg, #ff9800, #f44336)',
            color: 'white',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '600',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 9999,
            transition: 'all 0.3s ease'
          }}>
            <span style={{ fontSize: '18px' }}>⚠️</span> 
            <span>SECURITY DEGRADED: Blockchain authority unreachable during login. High-risk actions restricted.</span>
            
            <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                <button 
                  disabled={isUpgrading}
                  onClick={async () => {
                    setIsUpgrading(true);
                    try {
                        await (window as any).electronAPI.auth.triggerRecovery();
                    } catch (e) {
                        setIsUpgrading(false);
                    }
                  }}
                  style={{
                    background: isUpgrading ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    color: 'white',
                    padding: '2px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: isUpgrading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isUpgrading ? <RefreshCw className="animate-spin" size={12} /> : "RETRY NOW"}
                </button>

                <button 
                  onClick={() => setLogoutDialogOpen(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white',
                    padding: '2px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  LOGOUT
                </button>
            </div>
          </div>
        )}
      <ResilienceBanner mode={mode} onRetry={retry} />
      
      {appState === "initialize-system" && (
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
                  const url = `${config.remoteAuthUrl}/?mode=genesis`;
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
      )}

      {appState === "role-selection" && (
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
      )}

      {appState === "admin-login" && (
        <AdminLogin onLogin={handleAdminLogin} onBack={() => setAppState("role-selection")} />
      )}

      {appState === "notary-login" && (
        <NotaryLogin onLogin={handleNotaryLogin} onBack={() => setAppState("role-selection")} />
      )}

      {appState === "admin-app" && (
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
            {adminScreen === "dashboard" && <AdminDashboard onNavigate={(s) => setAdminScreen(s as AdminScreen)} isDarkMode={isDarkMode} user={user} />}
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
      )}

      {appState === "notary-app" && (
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
      )}

      {appState === "owner-app" && (
        <div className="flex h-screen bg-[#07090e]">
           <Sidebar
            role="owner" user={user} activeScreen="dashboard"
            onNavigate={() => {}} 
            onLogout={() => setLogoutDialogOpen(true)}
            alertCount={0} isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          />
          <main className="flex-1 overflow-auto bg-[#07090e] p-8 flex items-center justify-center">
             <JourneyErrorBoundary>
                <JourneyBox />
             </JourneyErrorBoundary>
          </main>
        </div>
      )}
    </div>
  );
}

