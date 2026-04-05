"use client"

import { TokenRequestInterface } from "../../../components/dashboard/token-request-interface"

export default function TokensPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Buy Tokens</h1>
        <p className="text-muted-foreground">Purchase NTKR tokens using BNB Testnet for document services</p>
      </div>

      <TokenRequestInterface />
    </div>
  )
}
