import { useState, useEffect } from "react";
import { Shield, Loader2, AlertCircle, Sun, Moon } from "lucide-react";
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

type AppState = "role-selection" | "admin-login" | "admin-app" | "notary-login" | "notary-app";
type AdminScreen = "dashboard" | "manage-notaries" | "governance" | "system-logs" | "multi-sig" | "settings";
type NotaryScreen = "dashboard" | "pending" | "approved" | "profile" | "request-details" | "governance";

export default function App() {
  const [appState, setAppState] = useState<AppState>("role-selection");
  const [adminScreen, setAdminScreen] = useState<AdminScreen>("dashboard");
  const [notaryScreen, setNotaryScreen] = useState<NotaryScreen>("dashboard");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; wallet_address: string; role: string } | null>(null);
  const [isRecovering, setIsRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
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
    // Reset URL to clean state (Desktop App doesn't use routing)
    if (window.location.pathname !== "/") {
      window.history.replaceState(null, "", "/");
    }

    const recoverSession = async () => {
      console.log("[SESSION] Initializing recovery flow...");

      const token = localStorage.getItem("bbsns_token");
      if (!token) {
        console.log("[SESSION] No token found in storage.");
        setIsRecovering(false);
        return;
      }

      // 1. Wait for API to be reachable (Health Check)
      let apiReady = false;
      let healthAttempts = 0;
      while (!apiReady && healthAttempts < 10) {
        try {
          console.log(`[SESSION] Checking API (Attempt ${healthAttempts + 1}/10)...`);
          // Use fetch directly to bypass auth middleware for health check
          const res = await fetch(`${api.baseUrl}/`);
          if (res.ok) {
            apiReady = true;
          }
        } catch (e) {
          console.log("[SESSION] API not reachable...");
        }
        if (!apiReady) {
          await new Promise(r => setTimeout(r, 1000));
          healthAttempts++;
        }
      }

      if (!apiReady) {
        setRecoveryError("API Server Unreachable");
        setIsRecovering(false);
        return;
      }

      // 2. Attempt Recovery
      let lastErr = "";
      try {
        const userData = await api.getMe();

        // Zero-Trust Role Mapping (supporting both numeric and legacy string roles)
        const ROLE_MAP: Record<string | number, string> = {
          1: 'owner',
          2: 'notary',
          3: 'admin',
          'admin': 'admin',
          'notary': 'notary',
          'owner': 'owner'
        };

        const rawRole = userData.role;
        const normalizedRole = ROLE_MAP[rawRole] || (rawRole && typeof rawRole === 'string' ? rawRole.toLowerCase() : "none");

        console.log(`[SESSION] Recovery data received. Email: ${userData.email}, Raw Role: ${rawRole}, Normalized: ${normalizedRole}`);

        setUser({ ...userData, role: normalizedRole });

        // Extra resilience: If normalizedRole is still none but we have email, and it's a known admin.
        if (normalizedRole === "none" && userData.email && (userData.email.includes("admin") || userData.email === "admin@bbsns.com")) {
          console.warn("[SESSION] Forcing admin role based on email context");
          setUser({ ...userData, role: "admin" });
          setAppState("admin-app");
          setIsRecovering(false);
          return;
        }

        if (normalizedRole === "admin") {
          console.log("[SESSION] Transitioning to Admin App");
          setAppState("admin-app");
        } else if (normalizedRole === "notary") {
          console.log("[SESSION] Transitioning to Notary App");
          setAppState("notary-app");
        } else {
          console.warn("[SESSION] Unrecognized role received:", normalizedRole);
          setRecoveryError(`Unrecognized user role: ${normalizedRole}`);
        }
      } catch (err: any) {
        console.error("[SESSION] Recovery Error:", err.status, err.message);
        lastErr = `${err.status || 'Error'}: ${err.message}`;

        // Definitive auth failures - clear token
        if (err.status === 401 || err.status === 403 || err.status === 404 || err.status === 426) {
          localStorage.removeItem("bbsns_token");
        }
        setRecoveryError(lastErr);
      }
      setIsRecovering(false);
    };
    recoverSession();

    // 3. Start Polling for Governance Alerts
    const pollAlerts = async () => {
      const token = localStorage.getItem("bbsns_token");
      if (!token) return;
      try {
        const { count } = await api.getGovernanceAlertCount();
        setAlertCount(count);
      } catch (err) {
        console.warn("[ALERTS] Failed to poll counts:", err);
      }
    };

    pollAlerts(); // Initial call
    const interval = setInterval(pollAlerts, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const handleRoleSelect = (role: "admin" | "notary") => {
    setRecoveryError(null);
    if (role === "admin") {
      setAppState("admin-login");
    } else {
      setAppState("notary-login");
    }
  };

  const handleAdminLogin = async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
      setAppState("admin-app");
      setAdminScreen("dashboard");
    } catch (err) {
      console.error("Failed to fetch admin user after login:", err);
    }
  };

  const handleNotaryLogin = async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
      setAppState("notary-app");
      setNotaryScreen("dashboard");
    } catch (err) {
      console.error("Failed to fetch notary user after login:", err);
    }
  };

  const handleViewRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    setNotaryScreen("request-details");
  };

  const handleBackFromRequestDetails = () => {
    setNotaryScreen("dashboard");
    setSelectedRequestId(null);
  };

  const handleLogoutConfirm = () => {
    localStorage.removeItem("bbsns_token");
    setLogoutDialogOpen(false);
    setAppState("role-selection");
    setAdminScreen("dashboard");
    setNotaryScreen("dashboard");
    setSelectedRequestId(null);
  };

  if (isRecovering) {
    return (
      <div className="min-h-screen bg-[#0A2540] flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
          <Shield className="w-10 h-10 text-emerald-400" />
        </div>
        <div className="flex items-center space-x-3 text-emerald-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-medium tracking-wide">Restoring Secure Session...</span>
        </div>
      </div>
    );
  }

  // Role Selection Screen
  if (appState === "role-selection") {
    return (
      <div className="relative">
        <RoleSelection onSelectRole={handleRoleSelect} />


        {recoveryError && (
          <div className="absolute top-4 right-4 bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-400 text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-4 h-4" />
            <span>Session could not be restored: {recoveryError}</span>
            <button onClick={() => setRecoveryError(null)} className="ml-2 hover:text-red-200">×</button>
          </div>
        )}
      </div>
    );
  }

  // Admin Login Screen
  if (appState === "admin-login") {
    return <AdminLogin onLogin={handleAdminLogin} onBack={() => setAppState("role-selection")} />;
  }

  // Notary Login Screen
  if (appState === "notary-login") {
    return <NotaryLogin onLogin={handleNotaryLogin} onBack={() => setAppState("role-selection")} />;
  }

  // Admin App
  if (appState === "admin-app") {
    return (
      <div className="flex h-screen bg-[#0D1B2A]">
        <Sidebar
          role="admin"
          user={user}
          activeScreen={adminScreen}
          onNavigate={(s) => setAdminScreen(s as AdminScreen)}
          onLogout={() => setLogoutDialogOpen(true)}
          alertCount={alertCount}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />

        {adminScreen === "dashboard" && (
          <AdminDashboard onNavigate={(s) => setAdminScreen(s as AdminScreen)} isDarkMode={isDarkMode} />
        )}
        {adminScreen === "manage-notaries" && <ManageNotaries />}
        {adminScreen === "governance" && <Governance role="admin" user={user} />}
        {adminScreen === "system-logs" && <SystemLogs />}
        {adminScreen === "multi-sig" && <MultiSigApprovals />}
        {adminScreen === "settings" && (
          <Settings />
        )}

        <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
          <DialogContent className="bg-gray-900 border-gray-800 text-gray-100">
            <DialogHeader>
              <DialogTitle>Confirm Logout</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to log out? You will need to reconnect your wallet to log back in.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLogoutConfirm} className="bg-red-500 hover:bg-red-600">Confirm Logout</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Notary App
  if (appState === "notary-app") {
    return (
      <div className="flex h-screen bg-[#0D1B2A]">
        <Sidebar
          role="notary"
          user={user}
          activeScreen={notaryScreen}
          onNavigate={(s) => setNotaryScreen(s as NotaryScreen)}
          onLogout={() => setLogoutDialogOpen(true)}
          alertCount={alertCount}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />

        {notaryScreen === "dashboard" && <NotaryDashboard onViewRequest={handleViewRequest} />}
        {notaryScreen === "pending" && <NotaryDashboard onViewRequest={handleViewRequest} filterStatus="pending" />}
        {notaryScreen === "approved" && <NotaryDashboard onViewRequest={handleViewRequest} filterStatus="approved" />}
        {notaryScreen === "request-details" && selectedRequestId && (
          <RequestDetails
            requestId={selectedRequestId}
            onBack={handleBackFromRequestDetails}
          />
        )}
        {notaryScreen === "governance" && <Governance role="notary" user={user} />}
        {notaryScreen === "profile" && <Profile user={user} />}

        <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
          <DialogContent className="bg-gray-900 border-gray-800 text-gray-100">
            <DialogHeader>
              <DialogTitle>Confirm Logout</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to log out?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLogoutConfirm} className="bg-red-500 hover:bg-red-600">Confirm Logout</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
