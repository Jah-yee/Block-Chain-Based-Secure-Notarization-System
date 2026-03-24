"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Shield, Upload, History, CheckCircle, Coins, Home, LogOut, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface SidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const menuItems = [
  { icon: Home, label: "Dashboard", href: "/dashboard" },
  { icon: Upload, label: "Upload", href: "/dashboard/upload" },
  { icon: History, label: "Versioning", href: "/dashboard/versioning" },
  { icon: CheckCircle, label: "Verification", href: "/dashboard/verification" },
  { icon: Coins, label: "Token Request", href: "/dashboard/tokens" },
]

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()

  const handleSignOut = () => {
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out.",
    })
    router.push("/")
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-foreground">BBSNS</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="lg:hidden">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={pathname === item.href ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start",
                pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              onClick={() => onOpenChange(false)}
            >
              <item.icon className="h-4 w-4 mr-3" />
              {item.label}
            </Button>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-sidebar border-r">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="p-0 w-64">
          <div className="bg-sidebar h-full">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
