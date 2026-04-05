"use client"

import { useEffect, useState } from "react"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { useRouter } from "next/navigation"
import { Sidebar } from "./sidebar"
import { DashboardHeader } from "./dashboard-header"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { user, isLoading, error } = useWalletSession()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    // Check local storage for collapsed preference if needed, 
    // but for now default to false is fine.
  }, [])

  useEffect(() => {
    if (mounted && !isLoading && !user && !error) {
      router.push("/login")
    }
  }, [user, isLoading, error, router, mounted])

  if (!mounted) return null

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-primary font-medium">Synchronizing Session...</span>
        </motion.div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-2xl">
            <h2 className="text-2xl font-bold text-destructive mb-2">Access Issue</h2>
            <p className="text-muted-foreground">{error || "You are not authorized to view this page. Please sign in."}</p>
          </div>
          <Button onClick={() => window.location.href = "/login"} variant="outline" className="w-full">
            Return to Login
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        collapsed={collapsed}
        onCollapseChange={setCollapsed}
      />

      <motion.div
        className={cn(
          "relative isolate transition-all duration-300 ease-in-out",
          collapsed ? "lg:ml-20" : "lg:ml-64"
        )}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />

        <motion.main
          className="p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key="dashboard-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.main>
      </motion.div>
    </div>
  )
}
