"use client"

import { useEffect, useState } from "react"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

export default function DashboardLayoutShell({
    children,
}: {
    children: React.ReactNode
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const { user, isLoading, error } = useWalletSession()
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
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
        return null // Redirecting to login via useEffect
    }

    return (
        <div className="min-h-screen bg-background">
            <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />

            <div className={cn("lg:ml-64 relative isolate")}>
                <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
                <main className="p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}
