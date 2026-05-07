import { Home, Users, FileText, CheckSquare, Settings, LogOut, User, Gavel, ChevronLeft, ChevronRight, Shield, Sun, Moon, LayoutDashboard, Database, Activity } from "lucide-react";
import { Button } from "../ui/button";
import { useState } from "react";

interface SidebarProps {
  role: "admin" | "notary" | "owner";
  user: { name: string; email: string; wallet_address: string } | null;
  activeScreen: string;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  alertCount?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  badge?: number;
}

export function Sidebar({ role, user, activeScreen, onNavigate, onLogout, alertCount = 0, isCollapsed, onToggleCollapse, isDarkMode, onToggleDarkMode }: SidebarProps) {
  const [showCopied, setShowCopied] = useState(false);

  const adminMenuItems: MenuItem[] = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "manage-notaries", label: "Notary Management", icon: Users },
    { id: "governance", label: "Governance Hub", icon: Gavel, badge: alertCount },
    { id: "system-logs", label: "Security Audit", icon: FileText },
    { id: "multi-sig", label: "Multi-Sig", icon: Shield },
    { id: "settings", label: "Protocol Settings", icon: Settings },
  ];

  const notaryMenuItems: MenuItem[] = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "pending", label: "Pending Tasks", icon: Activity },
    { id: "approved", label: "Processed", icon: CheckSquare },
    { id: "governance", label: "Voted Proposals", icon: Gavel, badge: alertCount },
    { id: "profile", label: "Account Profile", icon: User },
  ];

  const ownerMenuItems: MenuItem[] = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "profile", label: "Profile", icon: User },
  ];

  const menuItems: MenuItem[] = role === "admin" ? adminMenuItems : (role === "notary" ? notaryMenuItems : ownerMenuItems);

  const handleCopy = () => {
    if (user?.wallet_address) {
      navigator.clipboard.writeText(user.wallet_address);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  };

  return (
    <div className={`${isCollapsed ? "w-20" : "w-48"} bg-card border-r border-border/50 flex flex-col h-full transition-all duration-500 ease-in-out relative z-40 overflow-visible shadow-[10px_0_30px_rgba(0,0,0,0.1)] dark:shadow-[10px_0_30px_rgba(0,0,0,0.5)] flex-none`}>
      {/* 🛡️ [AESTHETIC] Animated Background Glow */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/20 blur-[100px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full" />
      </div>

      {/* Brand Header & Toggle Consolidation */}
      <div className={`flex items-center transition-all ${isCollapsed ? "py-6 flex-col gap-8 justify-center" : "p-5 border-b border-border/50 justify-between"}`}>
        <div className={`flex items-center ${isCollapsed ? "flex-col" : "gap-3"}`}>
          <div className="relative group">
              <div className="absolute inset-0 bg-emerald-500/40 blur-lg rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className={`relative bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl border border-white/10 shadow-lg transform group-hover:rotate-6 transition-transform ${isCollapsed ? 'p-1.5' : 'p-2'}`}>
                  <Shield size={isCollapsed ? 18 : 20} className="text-primary-foreground" />
              </div>
          </div>
          {!isCollapsed && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-500">
              <h2 className="text-lg font-black italic tracking-tighter text-foreground leading-none">BBSNS</h2>
              <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[9px] text-emerald-500/80 uppercase font-black tracking-widest">
                      {role === "admin" ? "Administrator" : (role === "notary" ? "Notary" : "Owner")}
                  </p>
              </div>
            </div>
          )}
        </div>

        {/* Improved Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className={`bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg p-2 transition-all border border-border/50 hover:border-primary/30 ${isCollapsed ? "w-10 h-10 flex items-center justify-center" : ""}`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>


      {/* Profile Section - Premium Overhaul */}
      {!isCollapsed ? (
        <div className="px-4 mt-2 animate-in fade-in duration-500">
          <div className="p-4 bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.05] rounded-2xl flex items-center gap-3 group hover:border-white/10 transition-colors relative">
            <div className="relative shrink-0">
               <div className="absolute inset-0 bg-emerald-500/20 blur-md rounded-full" />
               <div className="relative w-8 h-8 rounded-full bg-muted border border-border/50 flex items-center justify-center text-primary font-black shadow-inner text-xs">
                  {(user?.name || "U").slice(0, 1).toUpperCase()}
               </div>
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">{user?.name || "System Actor"}</p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-[8px] font-mono text-white/40 overflow-hidden">
                    <span className="truncate selectable">{user?.wallet_address || "0x00...000"}</span>
                </div>
                <button 
                  onClick={handleCopy}
                  className="p-1 hover:bg-white/10 rounded transition-colors text-white/20 hover:text-emerald-400 relative"
                  title="Copy Wallet Address"
                >
                  <FileText size={10} />
                  {showCopied && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded shadow-lg animate-in fade-in zoom-in duration-200">
                      COPIED!
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-6 group animate-in zoom-in duration-300">
           <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black shadow-lg group-hover:border-emerald-500/50 transition-all">
               {user?.name?.slice(0, 1).toUpperCase() || "U"}
           </div>
        </div>
      )}


      {/* Navigation */}
      <nav className="flex-1 p-4 mt-6 space-y-1.5 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={isCollapsed ? item.label : ""}
              className={`group w-full flex items-center transition-all duration-300 relative rounded-xl overflow-hidden ${isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3"} ${isActive
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-emerald-500 rounded-r-full shadow-[0_0_10px_#10b981]" />
              )}
              
              <div className="relative">
                <Icon size={18} className={`${isActive ? "text-emerald-400" : "group-hover:text-white"} transition-colors`} />
                {isCollapsed && item.badge && item.badge > 0 ? (
                  <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[7px] font-black w-3.5 h-3.5 flex items-center justify-center rounded-full border border-card shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              
              {!isCollapsed && (
                <span className={`relative z-10 flex-1 text-left text-sm font-medium ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                    {item.label}
                </span>
              )}

              {!isCollapsed && item.badge && item.badge > 0 ? (
                <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse">
                   {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Footer Controls */}
      <div className="p-4 border-t border-border/50 space-y-2 bg-gradient-to-t from-muted/5 to-transparent">
        <Button
          onClick={onToggleDarkMode}
          variant="ghost"
          className={`w-full group text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20 rounded-xl transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "justify-start px-4"}`}
        >
          {isDarkMode ? <Sun size={18} className={isCollapsed ? "" : "mr-3"} /> : <Moon size={18} className={isCollapsed ? "" : "mr-3"} />}
          {!isCollapsed && <span className="text-xs font-bold tracking-tight">APPEARANCE</span>}
        </Button>
        <Button
          onClick={onLogout}
          variant="ghost"
          className={`w-full group text-muted-foreground hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 rounded-xl transition-all duration-300 ${isCollapsed ? "justify-center px-0" : "justify-start px-4"}`}
        >
          <LogOut size={18} className={isCollapsed ? "" : "mr-3"} />
          {!isCollapsed && <span className="text-xs font-bold tracking-tight">LOGOUT</span>}
        </Button>
      </div>
    </div>
  );
}
