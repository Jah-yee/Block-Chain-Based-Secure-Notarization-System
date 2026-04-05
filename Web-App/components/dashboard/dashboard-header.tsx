"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Menu, Bell, User, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { ProfileDialog } from "./profile-dialog"
import { SettingsDialog } from "./settings-dialog"

interface DashboardHeaderProps {
  onMenuClick: () => void
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { user, logout } = useWalletSession()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSignOut = () => {
    setIsMenuOpen(false)
    logout()
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out.",
    })
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-x-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1"></div>

          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <ThemeToggle />

            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-auto flex items-center gap-2 px-2 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{user?.name?.slice(0, 2).toUpperCase() || "JD"}</AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start text-xs">
                    <span className="font-semibold">{user?.name || "Guest"}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || "John Doe"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email || "john@example.com"}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setIsProfileOpen(true), 100);
                }} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setIsSettingsOpen(true), 100);
                }} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive cursor-pointer" onSelect={handleSignOut}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <ProfileDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} />
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  )
}
