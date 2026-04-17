import { Home, Users, FileText, CheckSquare, Settings, LogOut, User, Gavel, ChevronLeft, ChevronRight, Shield, Sun, Moon } from "lucide-react";
import { Button } from "../ui/button";

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

export function Sidebar({ role, user, activeScreen, onNavigate, onLogout, alertCount = 0, isCollapsed, onToggleCollapse, isDarkMode, onToggleDarkMode }: SidebarProps) {
  const adminMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "manage-notaries", label: "Manage Notaries", icon: Users },
    { id: "governance", label: "Governance", icon: CheckSquare, badge: alertCount },
    { id: "system-logs", label: "System Logs", icon: FileText },
    { id: "multi-sig", label: "Multi-Sig Approvals", icon: CheckSquare },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const notaryMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "pending", label: "Pending", icon: FileText },
    { id: "approved", label: "Approved", icon: CheckSquare },
    { id: "governance", label: "Governance", icon: Gavel, badge: alertCount },
    { id: "profile", label: "Profile", icon: User },
  ];

  const ownerMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "profile", label: "Profile", icon: User },
  ];

  const menuItems = role === "admin" ? adminMenuItems : (role === "notary" ? notaryMenuItems : ownerMenuItems);

  return (
    <div className={`${isCollapsed ? "w-20" : "w-64"} bg-card border-r border-border flex flex-col h-screen transition-all duration-300 relative`}>
      {/* Collapse Toggle Button */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-20 bg-emerald-500 text-white rounded-full p-1 shadow-lg border border-emerald-400 hover:bg-emerald-600 z-50 transition-transform hover:scale-110"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`p-6 border-b border-border flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
        <div className="bg-primary/10 p-2 rounded-lg border border-primary/20">
          <Shield size={20} className="text-primary" />
        </div>
        {!isCollapsed && (
          <div>
            <h2 className="text-primary leading-none">BBSNS</h2>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-black tracking-tighter">
              {role === "admin" ? "Admin" : (role === "notary" ? "Notary" : "Document Owner")}
            </p>
          </div>
        )}
      </div>

      {/* Profile Badge Overlay */}
      {!isCollapsed && (
        <div className="p-4 mx-4 mt-6 bg-background border border-border rounded-xl flex items-center gap-3 shadow-lg shadow-black/20">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
            {(user?.name || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name || "Loading..."}</p>
            <p className="text-[10px] text-muted-foreground truncate font-mono">{(user?.wallet_address || "0x00...000").slice(0, 6)}...{(user?.wallet_address || "0000").slice(-4)}</p>
          </div>
        </div>
      )}
      {isCollapsed && (
        <div className="p-4 flex flex-col items-center mt-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
            {user?.name?.slice(0, 1).toUpperCase() || "U"}
          </div>
        </div>
      )}

      <nav className="flex-1 p-4 mt-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={isCollapsed ? item.label : ""}
              className={`w-full flex items-center transition-all ${isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3"} rounded-lg ${isActive
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? "text-primary-foreground" : "text-muted-foreground"} />
                {isCollapsed && item.badge && item.badge > 0 ? (
                  <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-card">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              {!isCollapsed && <span className="relative z-10 flex-1 text-left">{item.label}</span>}
              {!isCollapsed && item.badge && item.badge > 0 ? (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg shadow-destructive/20 animate-pulse">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <Button
          onClick={onToggleDarkMode}
          variant="ghost"
          className={`w-full text-muted-foreground hover:text-primary hover:bg-primary/10 ${isCollapsed ? "justify-center px-0" : "justify-start px-4"}`}
        >
          {isDarkMode ? <Sun size={20} className={isCollapsed ? "" : "mr-3"} /> : <Moon size={20} className={isCollapsed ? "" : "mr-3"} />}
          {!isCollapsed && <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>}
        </Button>
        <Button
          onClick={onLogout}
          variant="ghost"
          className={`w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 ${isCollapsed ? "justify-center px-0" : "justify-start px-4"}`}
        >
          <LogOut size={20} className={isCollapsed ? "" : "mr-3"} />
          {!isCollapsed && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );
}
