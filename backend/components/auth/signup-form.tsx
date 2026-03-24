"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Wallet, Eye, EyeOff } from "lucide-react"

export function SignUpForm() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    nationalId: "",
    walletConnected: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleWalletConnect = () => {
    // Mock wallet connection
    setIsLoading(true)
    setTimeout(() => {
      setFormData((prev) => ({ ...prev, walletConnected: true }))
      setIsLoading(false)
      toast({
        title: "Wallet Connected",
        description: "Your blockchain wallet has been successfully connected.",
      })
    }, 2000)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (formData.password.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      })
      return
    }

    if (!formData.walletConnected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your blockchain wallet to continue.",
        variant: "destructive",
      })
      return
    }

    // Mock successful registration
    toast({
      title: "Account Created",
      description: "Your account has been created successfully. Please sign in.",
    })
    router.push("/login")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={formData.username}
          onChange={(e) => handleInputChange("username", e.target.value)}
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
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Minimum 8 characters required</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nationalId">National ID</Label>
        <Input
          id="nationalId"
          value={formData.nationalId}
          onChange={(e) => handleInputChange("nationalId", e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Blockchain Wallet</Label>
        <Button
          type="button"
          variant={formData.walletConnected ? "secondary" : "outline"}
          onClick={handleWalletConnect}
          disabled={isLoading || formData.walletConnected}
          className="w-full"
        >
          <Wallet className="h-4 w-4 mr-2" />
          {isLoading ? "Connecting..." : formData.walletConnected ? "Wallet Connected" : "Connect Wallet"}
        </Button>
      </div>

      <Button type="submit" className="w-full">
        Create Account
      </Button>
    </form>
  )
}
