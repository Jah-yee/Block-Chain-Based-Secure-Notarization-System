"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Eye, EyeOff, Wallet } from "lucide-react"
import { apiClient } from "@/lib/api-client"

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nationalId: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("")

  const router = useRouter()
  const { toast } = useToast()

  // Local Wallet State
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [isConnected, setIsConnected] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Sync with localStorage on mount
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("connectedWallet")
    if (saved) {
      setWalletAddress(saved)
      setIsConnected(true)
    }
  }, [])

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          setIsConnected(true)
          localStorage.setItem("connectedWallet", accounts[0])
        } else {
          setWalletAddress("")
          setIsConnected(false)
          localStorage.removeItem("connectedWallet")
        }
      }

        ; (window as any).ethereum.on('accountsChanged', handleAccounts)
      return () => {
        ; (window as any).ethereum.removeListener('accountsChanged', handleAccounts)
      }
    }
  }, [])

  const handleWalletConnect = async () => {
    if (!(window as any).ethereum) {
      toast({
        title: "MetaMask Not Found",
        description: "Please install MetaMask and refresh this page.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.");
      }

      const address = accounts[0];
      setWalletAddress(address);
      setIsConnected(true);
      localStorage.setItem("connectedWallet", address);

      toast({
        title: "Wallet Connected",
        description: `Active: ${address.substring(0, 6)}...${address.substring(38)} `,
      });
    } catch (err: any) {
      toast({
        title: "Connection Failed",
        description: err.message || "Failed to connect wallet.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    let filteredValue = value;
    if (field === "nationalId") {
      filteredValue = value.replace(/[^a-zA-Z0-9]/g, "");
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
      const { exists } = await apiClient.post('/auth/pre-check', {
        email: formData.email.toLowerCase().trim()
      });

      if (!exists) {
        toast({
          title: "Account Not Found",
          description: "We couldn't find an account with that email. Please sign up to create one.",
          variant: "destructive",
        });
        setIsLoading(false);
        setStatus("");
        return;
      }

      const { nonce, message_template } = await apiClient.post('/auth/nonce', {
        wallet_address: walletAddress,
        action: 'login'
      });

      const message = message_template || `Login request for BBSNS: ${nonce} `

      setStatus("Sign in your wallet...")
      const { ethers } = await import("ethers")
      if (!(window as any).ethereum) throw new Error("Wallet disconnected");

      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner()
      const signature = await signer.signMessage(message)

      setStatus("Completing login...")
      const data = await apiClient.post('/auth/login', {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        walletAddress: walletAddress,
        signature: signature,
        nationalId: formData.nationalId,
      })

      // Token is now set via HttpOnly cookie by the backend
      toast({ title: "Secure Login Successful", description: `Welcome back!` })

      // Redirect to callbackUrl (e.g. remote-login page) or dashboard
      window.location.href = callbackUrl || "/dashboard"
    } catch (err: any) {
      console.error("Login error:", err)
      toast({ title: "Auth Error", description: err.message || "Login failed.", variant: "destructive" })
    } finally {
      setIsLoading(false)
      setStatus("")
    }
  }

  if (!mounted) return null

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">1. Wallet Security</Label>
        {isConnected ? (
          <div className="flex items-center justify-between gap-2 p-2 rounded bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
              <Wallet className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{walletAddress}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={handleWalletConnect} className="h-7 text-xs">Change</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={handleWalletConnect} className="w-full gap-2">
            <Wallet className="h-4 w-4" /> Connect Wallet
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">2. Multi-Factor Auth</Label>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => handleInputChange("password", e.target.value)} required />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nationalId">National ID Number</Label>
          <Input id="nationalId" value={formData.nationalId} onChange={(e) => handleInputChange("nationalId", e.target.value)} placeholder="Required for 3rd factor" required />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !isConnected}>
        {isLoading ? (status || "Signing in...") : "Secure Sign In"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don't have an account? <a href="/signup" className="text-primary hover:underline font-medium">Sign up</a>
      </p>
    </form>
  )
}
