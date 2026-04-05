"use client"

import { DashboardOverview } from "../../components/dashboard/dashboard-overview"
import { DocumentsTable } from "../../components/dashboard/documents-table"
import { TokenBalance } from "../../components/dashboard/token-balance"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <TokenBalance />
      </div>

      <DashboardOverview />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Your Documents</h2>
        <DocumentsTable />
      </div>
    </div>
  )
}
