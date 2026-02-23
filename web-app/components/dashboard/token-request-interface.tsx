"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Coins, CreditCard, Wallet, ArrowRight, AlertCircle, Loader2 } from "lucide-react"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { ethers } from "ethers"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useEffect } from "react"
import { apiClient } from "@/lib/api-client"

const NTKR_ADDRESS = process.env.NEXT_PUBLIC_NTKR_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
const NTKR_ABI = [
  "function buyPackage(uint256 packageId) external payable",
  "function userDailyLimit(address) view returns (uint256)",
  "function dailySubmissionCount(address) view returns (uint256)"
];

const tokenPackages = [
  { id: 1, amount: 5, price: "0.001 BNB", bnbValue: "0.001", description: "Basic entry pack for standard notarizations" },
  { id: 2, amount: 15, price: "0.002 BNB", bnbValue: "0.002", description: "Popular choice for active professional users" },
  { id: 3, amount: 30, price: "0.003 BNB", bnbValue: "0.003", description: "Best value for high-volume enterprise needs" },
]

const NTKR_CAP = 100;

export function TokenRequestInterface() {
  const { balances, liveBalances, connectedAccount, refreshBalances, connectWallet, user, isLoading: isProfileLoading } = useWalletSession()
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { toast } = useToast()

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refreshBalances()
    setIsRefreshing(false)
  }

  const isWrongNetwork = liveBalances.chainId !== null && liveBalances.chainId !== 97;
  const walletMismatch = Boolean(connectedAccount && user?.wallet_address &&
    connectedAccount.toLowerCase() !== user.wallet_address.toLowerCase());

  const handleBuyPackage = async (packageId: number, bnbValue: string) => {
    if (!window.ethereum) {
      toast({ title: "Wallet Missing", description: "Please install MetaMask", variant: "destructive" });
      return;
    }

    // 1. Check BNB Balance Requirement
    const userBnb = parseFloat(liveBalances.bnb || "0");
    const requiredBnb = parseFloat(bnbValue);

    if (userBnb < requiredBnb) {
      toast({
        title: "Insufficient BNB",
        description: `Your balance is ${userBnb.toFixed(4)} BNB, but this package requires ${bnbValue} BNB on the testnet.`,
        variant: "destructive"
      });
      return;
    }

    const pkg = tokenPackages.find(p => p.id === packageId);
    const tokenAmount = pkg ? pkg.amount : 0;

    setSubmittingId(packageId);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(NTKR_ADDRESS, NTKR_ABI, signer);

      toast({
        title: "Confirm Purchase",
        description: `Please confirm in MetaMask to buy ${tokenAmount} NTKR for ${bnbValue} BNB.`
      });

      const tx = await contract.buyPackage(packageId, {
        value: ethers.parseEther(bnbValue)
      });

      toast({
        title: "Transaction Sent",
        description: "Waiting for confirmation...",
      });

      await tx.wait();

      // 4. Notify Backend of the Deposit to update internal balance
      try {
        toast({
          title: "Syncing Balance",
          description: "Updating your internal account...",
        });

        await apiClient.post("/tokens/deposit", {
          transactionHash: tx.hash,
          packageId: packageId
        });

        toast({
          title: "Internal Balance Updated",
          description: "Your document submission limit has been increased.",
        });
      } catch (depositErr: any) {
        console.error("Deposit Notification Failed:", depositErr);
        toast({
          title: "Balance Refresh Delayed",
          description: "Blockchain confirmed, but internal balance update pending. Please refresh in a moment.",
          variant: "destructive"
        });
      }

      await refreshBalances();
    } catch (err: any) {
      console.error(err);

      // Check for user rejection (MetaMask error code 4001 or Ethers ACTION_REJECTED)
      if (err.code === 4001 || err.code === "ACTION_REJECTED" || err.info?.error?.code === 4001 || err.message?.includes("user rejected")) {
        toast({
          title: "Transaction Cancelled",
          description: "You cancelled the purchase.",
          variant: "default",
        });
      } else {
        toast({
          title: "Transaction Failed",
          description: err.message || "Could not complete purchase",
          variant: "destructive",
        });
      }
    } finally {
      setSubmittingId(null);
    }
  }

  const currentNtkr = parseFloat(liveBalances.ntkr || "0");

  return (
    <div className="space-y-6">
      {isWrongNetwork && (
        <Alert variant="destructive" className="bg-orange-500/10 border-orange-500/20 text-orange-600 mb-4 animate-in slide-in-from-top duration-500">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs font-medium flex items-center justify-between w-full">
            <span><strong>Wrong Network:</strong> You are connected to Chain ID {liveBalances.chainId}. Please switch to BNB Testnet (Chain ID 97) to see your tokens.</span>
            <Button size="sm" variant="outline" className="h-7 text-[10px] ml-4 bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/40" onClick={() => window.ethereum?.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x61' }] })}>
              Switch Network
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {walletMismatch && !isWrongNetwork && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs font-medium">
            <strong>Wallet Mismatch:</strong> Your connected MetaMask account ({connectedAccount?.slice(0, 6)}...) does not match your authorized profile. Please switch accounts in MetaMask.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span>Wallet Balance</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 text-muted-foreground hover:text-primary"
                  onClick={async () => {
                    if (!window.ethereum) return;
                    try {
                      await window.ethereum.request({
                        method: 'wallet_watchAsset',
                        params: {
                          type: 'ERC20',
                          options: {
                            address: NTKR_ADDRESS,
                            symbol: 'NTKR',
                            decimals: 18,
                          },
                        },
                      });
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                >
                  + Add Token
                </Button>
                {connectedAccount && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full text-[10px] uppercase font-bold tracking-tighter">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-around items-center mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {liveBalances.ntkr ? parseFloat(liveBalances.ntkr).toFixed(1) : parseFloat(balances?.ntkr || "0").toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                  NTKR ({liveBalances.isLive ? "Live" : "Cached"})
                </div>
              </div>
              <div className="w-px h-10 bg-border/50" />
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">
                  {liveBalances.bnb ? parseFloat(liveBalances.bnb).toFixed(4) : parseFloat(balances?.bnb || "0").toFixed(4)}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold font-mono">
                  BNB ({liveBalances.isLive ? "Live" : "Cached"})
                </div>
              </div>
            </div>

            {!connectedAccount ? (
              <Button
                onClick={connectWallet}
                className="w-full bg-primary/20 text-primary hover:bg-primary/25 border-primary/30"
                variant="outline"
              >
                Connect MetaMask for Live Stats
              </Button>
            ) : (
              <div className="bg-muted/40 rounded-xl p-3 border border-border/40 shadow-inner">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Profile Wallet</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${walletMismatch ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}`}>
                    {walletMismatch ? 'Mismatch' : 'Linked'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-foreground/80 truncate bg-background/50 px-2 py-1 rounded">
                    {user?.wallet_address ? `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}` : "No wallet linked"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg hover:bg-primary/15 hover:text-primary shrink-0"
                    onClick={handleRefresh}
                    disabled={isRefreshing || isProfileLoading}
                  >
                    <div className={isRefreshing ? "animate-spin" : ""}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                    </div>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-foreground" />
              <span>Limit Protection</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center mb-2">
              <div className="text-2xl font-bold text-foreground">{parseFloat(liveBalances.ntkr || "0").toFixed(0)} / {NTKR_CAP}</div>
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Wallet Tokens Capacity</div>
            </div>
            <div className="space-y-1.5">
              <Progress value={(parseFloat(liveBalances.ntkr || "0") / NTKR_CAP) * 100} className="h-2" />
              <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                <span>0</span>
                <span>50%</span>
                <span>{NTKR_CAP} Max</span>
              </div>
            </div>
            <div className="p-2 bg-accent/5 border border-accent/10 rounded-lg">
              <p className="text-[10px] text-muted-foreground leading-relaxed italic text-center">
                To ensure network stability, wallets are capped at 100 tokens.
                Each package includes a <strong>3 Daily Submission Limit</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buy NTKR Tokens</CardTitle>
          <CardDescription>
            Purchase NTKR tokens directly using BNB on Testnet.
            Maximum wallet limit is 100 NTKR.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {tokenPackages.map((pkg) => {
              const currentBnb = liveBalances.bnb ? parseFloat(liveBalances.bnb) : parseFloat(balances?.bnb || "0");
              const currentNtkr = liveBalances.ntkr ? parseFloat(liveBalances.ntkr) : parseFloat(balances?.ntkr || "0");
              const requiredBnb = parseFloat(pkg.bnbValue);

              const wouldExceedNtkr = currentNtkr + pkg.amount > NTKR_CAP;
              const hasInsufficientBnb = currentBnb < requiredBnb;

              return (
                <Card key={pkg.id} className={`relative overflow-hidden group hover:border-primary transition-all duration-300 ${hasInsufficientBnb || wouldExceedNtkr ? 'opacity-90' : ''}`}>
                  <CardContent className="p-6 text-center">
                    <div className="flex items-center justify-center mb-4">
                      <div className={`p-3 rounded-full ${hasInsufficientBnb ? 'bg-destructive/10' : 'bg-primary/10'} group-hover:scale-110 transition-transform`}>
                        <Coins className={`h-8 w-8 ${hasInsufficientBnb ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                    </div>
                    <div className="text-3xl font-bold mb-1 tracking-tight">{pkg.amount}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-4">NTKR Tokens</div>
                    <div className={`text-2xl font-bold mb-2 ${hasInsufficientBnb ? 'text-destructive' : 'text-primary'}`}>{pkg.price}</div>

                    {hasInsufficientBnb && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-destructive/10 text-destructive rounded-md text-[9px] font-bold mb-4 uppercase tracking-tighter ring-1 ring-destructive/20 animate-pulse">
                        <AlertCircle className="h-3 w-3" />
                        Insufficient BNB
                      </div>
                    )}

                    {wouldExceedNtkr && !hasInsufficientBnb && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-accent/20 text-accent-foreground rounded-md text-[9px] font-bold mb-4 uppercase tracking-tighter">
                        <AlertCircle className="h-3 w-3" />
                        Cap Limit Near
                      </div>
                    )}

                    <div className="text-[10px] text-muted-foreground p-3 bg-muted/30 rounded-lg mb-4 leading-relaxed font-medium min-h-[50px] flex items-center justify-center italic">
                      {pkg.description}
                    </div>
                    <Button
                      className="w-full font-bold uppercase tracking-wider text-xs h-10 shadow-lg"
                      variant={wouldExceedNtkr || hasInsufficientBnb || walletMismatch ? "outline" : "default"}
                      disabled={submittingId !== null || wouldExceedNtkr || hasInsufficientBnb || walletMismatch}
                      onClick={() => handleBuyPackage(pkg.id, pkg.bnbValue)}
                    >
                      {submittingId === pkg.id ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing
                        </span>
                      ) : (
                        wouldExceedNtkr ? "Limit Reached" : (walletMismatch ? "Wrong Wallet" : "Buy Package")
                      )}
                      {!submittingId && !wouldExceedNtkr && !walletMismatch && <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
