"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Shield, Upload, History, CheckCircle, Coins, Home, LogOut, X, ChevronLeft, ChevronRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useWalletSession } from "@/hooks/use-wallet-session"

interface SidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
}

const menuItems = [
  { icon: Home, label: "Dashboard", href: "/dashboard" },
  { icon: Upload, label: "Upload", href: "/dashboard/upload" },
  { icon: History, label: "Versioning", href: "/dashboard/versioning" },
  { icon: CheckCircle, label: "Verification", href: "/dashboard/verification" },
  { icon: Coins, label: "Buy Tokens", href: "/dashboard/tokens" },
]

export function Sidebar({ open, onOpenChange, collapsed = false, onCollapseChange }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useWalletSession()
  const { toast } = useToast()

  const handleSignOut = () => {
    logout()
  }

  const SidebarContent = ({ isMobile = false }) => (
    <div className={cn("flex flex-col h-full bg-card border-r border-border transition-all duration-300", collapsed && !isMobile ? "w-20" : "w-64")}>
      <div className={cn("flex items-center justify-between p-6 border-b border-border h-16 box-border", collapsed && !isMobile && "justify-center p-0")}>
        {!collapsed || isMobile ? (
          <div className="flex items-center space-x-2 overflow-hidden">
            <Shield className="h-8 w-8 text-primary shrink-0" />
            <span className="text-xl font-bold text-foreground tracking-tight whitespace-nowrap">BBSNS</span>
          </div>
        ) : (
          <Shield className="h-8 w-8 text-primary mx-auto" />
        )}

        {isMobile && (
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="lg:hidden text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-2 overflow-y-auto overflow-x-hidden">
        {menuItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start transition-all duration-200",
                isActive && "bg-primary/10 text-primary hover:bg-primary/15",
                !isActive && "text-muted-foreground hover:text-foreground",
                collapsed && !isMobile && "p-2 justify-center"
              )}
              onClick={() => isMobile && onOpenChange(false)}
              title={collapsed && !isMobile ? item.label : undefined}
            >
              <Link href={item.href} className={cn("flex items-center gap-3", collapsed && !isMobile && "justify-center w-full")}>
                <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
              </Link>
            </Button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto space-y-2">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-primary hover:text-primary hover:bg-primary/10",
            collapsed && !isMobile && "justify-center p-2"
          )}
          onClick={async () => {
            if (!window.ethereum) return;
            try {
              await window.ethereum.request({
                method: 'wallet_watchAsset',
                params: {
                  type: 'ERC20',
                  options: {
                    address: process.env.NEXT_PUBLIC_NTKR_CONTRACT_ADDRESS || "",
                    symbol: 'NTKR',
                    decimals: 18,
                  },
                },
              });
              toast({ title: "Token Added", description: "NTKR has been added to your wallet." });
            } catch (error) {
              console.error(error);
              toast({ title: "Error", description: "Failed to add token to wallet.", variant: "destructive" });
            }
          }}
          title={collapsed && !isMobile ? "Add NTKR to Wallet" : undefined}
        >
          <Coins className={cn("h-4 w-4 shrink-0", (!collapsed || isMobile) && "mr-3")} />
          {(!collapsed || isMobile) && <span>Add NTKR to Wallet</span>}
        </Button>

        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10",
            collapsed && !isMobile && "justify-center p-2"
          )}
          onClick={handleSignOut}
          title={collapsed && !isMobile ? "Sign Out" : undefined}
        >
          <LogOut className={cn("h-4 w-4 shrink-0", (!collapsed || isMobile) && "mr-3")} />
          {(!collapsed || isMobile) && <span>Sign Out</span>}
        </Button>
      </div>

      {!isMobile && onCollapseChange && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-border bg-background shadow-md z-50 hover:bg-accent"
          onClick={() => onCollapseChange(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </Button>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar - Fixed but varying width */}
      <div
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:z-[40] lg:flex lg:flex-col shadow-xl transition-all duration-300 ease-in-out bg-card",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <SidebarContent isMobile={false} />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="p-0 w-64 border-r border-border bg-card">
          <SidebarContent isMobile={true} />
        </SheetContent>
      </Sheet>
    </>
  )
}
