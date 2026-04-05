import { Card, CardContent } from "@/components/ui/card"
import { Coins, Loader2 } from "lucide-react"
import { useWalletSession } from "@/hooks/use-wallet-session"

export function TokenBalance() {
  const { balances, liveBalances, user, isLoading } = useWalletSession()

  const ntkr = liveBalances.ntkr || balances?.ntkr || "0.0"
  const bnb = liveBalances.bnb || balances?.bnb || "0.0000"
  const ntk = liveBalances.ntk || balances?.ntk || "0.0"

  const isUser = user?.role === 'user'
  const isAuthority = user?.role === 'admin' || user?.role === 'notary'

  return (
    <Card className="bg-background/50 border-primary/10 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live Assets</span>
          </div>
          {liveBalances.isLive && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded-full text-[9px] uppercase font-bold">
              <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-0.5">
            <p className="text-lg font-bold text-foreground leading-none">{parseFloat(ntkr).toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">NTKR Tokens</p>
          </div>
          <div className="space-y-0.5 text-right">
            <p className="text-lg font-bold text-accent leading-none">{parseFloat(bnb).toFixed(4)}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight font-mono">BNB ({liveBalances.isLive ? 'Bsc' : 'Testnet'})</p>
          </div>
        </div>

        {isAuthority && ntk !== "0.0" && (
          <div className="pt-2 border-t border-border/50 flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Authority NTK</span>
            <span className="text-xs font-bold text-primary/80">{parseFloat(ntk).toFixed(1)}</span>
          </div>
        )}

        {isLoading && !liveBalances.isLive && (
          <div className="flex items-center gap-1.5 justify-center pt-1">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Syncing...</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
