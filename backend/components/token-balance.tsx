import { Card, CardContent } from "@/components/ui/card"
import { Coins } from "lucide-react"
import { mockUser } from "@/lib/mock-data"

export function TokenBalance() {
  return (
    <Card>
      <CardContent className="flex items-center space-x-2 p-4">
        <Coins className="h-5 w-5 text-accent" />
        <div>
          <p className="text-sm font-medium text-foreground">{mockUser.tokenBalance} NTKR</p>
          <p className="text-xs text-muted-foreground">Available Balance</p>
        </div>
      </CardContent>
    </Card>
  )
}
