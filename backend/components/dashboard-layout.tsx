"use client"

import type React from "react"
import { useState } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />

      <motion.div
        className={cn("transition-all duration-300", "lg:ml-64")}
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
