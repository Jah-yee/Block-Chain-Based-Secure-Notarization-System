"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Eye, EyeOff, Wallet, ChevronDown, Check } from "lucide-react"
import { apiClient } from "@/lib/api-client"

/** Converts raw MetaMask errors into short, user-friendly messages */
function getFriendlyWalletError(err: any): string {
  const code = err?.code ?? err?.error?.code
  const msg = (err?.message || "").toLowerCase()
  if (code === 4001 || msg.includes("user rejected") || msg.includes("user denied")) {
    return "Request denied. You rejected the wallet action."
  }
  if (code === -32002) {
    return "MetaMask is already processing a request. Please open MetaMask."
  }
  if (msg.includes("network") || msg.includes("rpc")) {
    return "Network error. Please check your connection."
  }
  // Return a trimmed plain-text message, never raw JSON
  return err?.shortMessage || err?.reason || (err?.message?.split("(")[0]?.trim()) || "An unexpected wallet error occurred."
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nationalId: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("")

  const { toast } = useToast()

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [isConnected, setIsConnected] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Account selection state
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([])
  const [showAccountPicker, setShowAccountPicker] = useState(false)

  // Sync with localStorage on mount
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("connectedWallet")
    if (saved) {
      setWalletAddress(saved)
      setIsConnected(true)
    }
  }, [])

  // Listen for account changes from MetaMask
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          // If current account was removed, default to first
          if (!accounts.includes(walletAddress)) {
            setWalletAddress(accounts[0])
            setIsConnected(true)
            localStorage.setItem("connectedWallet", accounts[0])
          }
          setAvailableAccounts(accounts)
        } else {
          setWalletAddress("")
          setIsConnected(false)
          setAvailableAccounts([])
          localStorage.removeItem("connectedWallet")
        }
      }
      ;(window as any).ethereum.on('accountsChanged', handleAccounts)
      return () => {
        ;(window as any).ethereum.removeListener('accountsChanged', handleAccounts)
      }
    }
  }, [walletAddress])

  const handleWalletConnect = async () => {
    if (!(window as any).ethereum) {
      toast({
        title: "MetaMask Not Found",
        description: "Please install MetaMask and refresh this page.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      // Force MetaMask to show its native account picker UI
      await (window as any).ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      })

      // After user picks account(s) in MetaMask, fetch the permitted list
      const accounts: string[] = await (window as any).ethereum.request({
        method: "eth_accounts",
      })

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.")
      }

      setAvailableAccounts(accounts)

      if (accounts.length === 1) {
        // Only one account permitted — connect directly
        const address = accounts[0]
        setWalletAddress(address)
        setIsConnected(true)
        localStorage.setItem("connectedWallet", address)
        toast({
          title: "Wallet Connected",
          description: `Active: ${address.substring(0, 6)}...${address.substring(38)}`,
        })
      } else {
        // Multiple accounts permitted — show our picker
        setShowAccountPicker(true)
        toast({
          title: "Select Account",
          description: `${accounts.length} accounts available. Please select one below.`,
        })
      }
    } catch (err: any) {
      toast({
        title: "Connection Failed",
        description: getFriendlyWalletError(err),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAccount = (address: string) => {
    setWalletAddress(address)
    setIsConnected(true)
    setShowAccountPicker(false)
    localStorage.setItem("connectedWallet", address)
    toast({
      title: "Account Selected",
      description: `Using: ${address.substring(0, 6)}...${address.substring(38)}`,
    })
  }

  const handleChangeAccount = async () => {
    if (availableAccounts.length > 1) {
      setShowAccountPicker(true)
    } else {
      // Re-request to get updated account list
      await handleWalletConnect()
    }
  }

  const handleInputChange = (field: string, value: string) => {
    let filteredValue = value
    if (field === "nationalId") {
      filteredValue = value.replace(/[^a-zA-Z0-9]/g, "")
    }
    setFormData((prev) => ({ ...prev, [field]: filteredValue }))
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.email || !formData.password || !formData.nationalId) {
      toast({
        title: "Missing fields",
        description: "Please enter email, password, and National ID.",
        variant: "destructive",
      })
      return
    }

    if (!isConnected || !walletAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to secure your login.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setStatus("Verifying account...")
    try {
      const { exists, role } = await apiClient.post('/auth/pre-check', {
        walletAddress: walletAddress.toLowerCase().trim()
      })

      if (!exists) {
        toast({
          title: "Account Not Found",
          description: "We couldn't find an account linked to this wallet. Please sign up or select a different account.",
          variant: "destructive",
        })
        setIsLoading(false)
        setStatus("")
        return
      }

      // Block Admin/Notary from Web-App
      if (role === 'admin' || role === 'notary') {
        toast({
          title: "Unauthorized Access",
          description: "This portal is for Document Owners only. Please use the BBSNS Desktop Application for management roles.",
          variant: "destructive",
        })
        setIsLoading(false)
        setStatus("")
        return
      }

      const { nonce, message_template } = await apiClient.post('/auth/nonce', {
        wallet_address: walletAddress,
        action: 'login'
      })

      const message = message_template || `Login request for BBSNS: ${nonce}`

      setStatus("Sign in your wallet...")
      const { ethers } = await import("ethers")
      if (!(window as any).ethereum) throw new Error("Wallet disconnected")

      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner(walletAddress)
      const signature = await signer.signMessage(message)

      setStatus("Completing login...")
      await apiClient.post('/auth/login', {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        walletAddress: walletAddress,
        signature: signature,
        signature_nonce: nonce,
        nationalId: formData.nationalId,
      })

      toast({ title: "Secure Login Successful", description: `Welcome back!` })
      window.location.href = callbackUrl || "/dashboard"
    } catch (err: any) {
      console.error("Login error:", err)
      const description = getFriendlyWalletError(err)
      toast({ title: "Request Denied", description, variant: "destructive" })
    } finally {
      setIsLoading(false)
      setStatus("")
    }
  }

  if (!mounted) return null

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      {/* Step 1: Wallet */}
      <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">1. Wallet Security</Label>

        {isConnected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 p-2 rounded bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                <Wallet className="h-4 w-4 shrink-0" />
                <span className="truncate max-w-[160px] font-mono text-xs">{walletAddress}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleChangeAccount}
                className="h-7 text-xs gap-1 shrink-0"
              >
                <ChevronDown className="h-3 w-3" />
                Change
              </Button>
            </div>

            {/* Account Picker Dropdown */}
            {showAccountPicker && availableAccounts.length > 1 && (
              <div className="rounded-md border bg-background shadow-md divide-y overflow-hidden">
                <p className="text-xs text-muted-foreground px-3 py-2 font-medium bg-muted/50">
                  Select wallet account to use:
                </p>
                {availableAccounts.map((account) => (
                  <button
                    key={account}
                    type="button"
                    onClick={() => handleSelectAccount(account)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs">
                        {account.substring(0, 10)}...{account.substring(36)}
                      </span>
                    </div>
                    {account.toLowerCase() === walletAddress.toLowerCase() && (
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={handleWalletConnect}
            disabled={isLoading}
            className="w-full gap-2"
          >
            <Wallet className="h-4 w-4" />
            {isLoading ? "Connecting..." : "Connect Wallet"}
          </Button>
        )}
      </div>

      {/* Step 2: Credentials */}
      <div className="space-y-4">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">2. Multi-Factor Auth</Label>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nationalId">National ID Number</Label>
            <Input
              id="nationalId"
              value={formData.nationalId}
              onChange={(e) => handleInputChange("nationalId", e.target.value)}
              placeholder="Required for 3rd factor"
              required
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !isConnected}>
        {isLoading ? (status || "Signing in...") : "Secure Sign In"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/signup" className="text-primary hover:underline font-medium">
          Sign up
        </a>
      </p>
    </form>
  )
}
