"use client"

import { KYCAdminPanel } from "@/components/dashboard/kyc-admin-panel"
import { GovernancePanel } from "@/components/dashboard/governance-panel"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AdminDashboardPage() {
    const { user, isLoading } = useWalletSession()
    const router = useRouter()

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "admin")) {
            router.push("/dashboard")
        }
    }, [user, isLoading, router])

    if (isLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user || user.role !== "admin") {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have administrative privileges to access this page.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Admin Control Center</h1>
            </div>

            <Tabs defaultValue="users" className="space-y-4">
                <TabsList className="bg-slate-900 border border-slate-800">
                    <TabsTrigger value="users" className="data-[state=active]:bg-primary">User Management</TabsTrigger>
                    <TabsTrigger value="governance" className="data-[state=active]:bg-primary">Governance & Proposals</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-4">
                    <KYCAdminPanel />
                </TabsContent>

                <TabsContent value="governance" className="space-y-4">
                    <GovernancePanel />
                </TabsContent>
            </Tabs>
        </div>
    )
}
