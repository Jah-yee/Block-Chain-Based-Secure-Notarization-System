import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { TokenRequestInterface } from "@/components/dashboard/token-request-interface"

export default function TokensPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Request Tokens</h1>
          <p className="text-muted-foreground">Request NTKR tokens for document notarization services</p>
        </div>

        <TokenRequestInterface />
      </div>
    </DashboardLayout>
  )
}
