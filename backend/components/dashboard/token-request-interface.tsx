"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Coins, CreditCard, Wallet } from "lucide-react"
import { mockUser } from "@/lib/mock-data"

export function TokenRequestInterface() {
  const [formData, setFormData] = useState({
    tokenAmount: "",
    purpose: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.tokenAmount || Number.parseInt(formData.tokenAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid number of tokens to request.",
        variant: "destructive",
      })
      return
    }

    if (!formData.purpose.trim()) {
      toast({
        title: "Purpose Required",
        description: "Please provide a purpose for this token request.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    // Mock token request process
    setTimeout(() => {
      setIsSubmitting(false)
      toast({
        title: "Token Request Submitted",
        description: `Your request for ${formData.tokenAmount} NTKR tokens has been submitted successfully. You will be notified once approved.`,
      })
      setFormData({ tokenAmount: "", purpose: "" })
    }, 2000)
  }

  const tokenPackages = [
    { amount: 10, price: "$5.00", description: "Basic package for small documents" },
    { amount: 50, price: "$20.00", description: "Standard package for regular use" },
    { amount: 100, price: "$35.00", description: "Premium package with 30% savings" },
    { amount: 500, price: "$150.00", description: "Enterprise package with 40% savings" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span>Current Balance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{mockUser.tokenBalance}</div>
              <div className="text-sm text-muted-foreground">NTKR Tokens Available</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span>Token Value</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">$0.10</div>
              <div className="text-sm text-muted-foreground">Per NTKR Token</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token Packages</CardTitle>
          <CardDescription>Choose from our pre-configured token packages or request a custom amount</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {tokenPackages.map((pkg, index) => (
              <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Coins className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-2xl font-bold">{pkg.amount}</div>
                  <div className="text-sm text-muted-foreground mb-2">NTKR Tokens</div>
                  <div className="text-lg font-semibold text-primary">{pkg.price}</div>
                  <div className="text-xs text-muted-foreground mt-2">{pkg.description}</div>
                  <Button className="w-full mt-3" size="sm">
                    Select Package
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Token Request</CardTitle>
          <CardDescription>Request a specific number of tokens for your notarization needs</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tokenAmount">Number of Tokens</Label>
              <Input
                id="tokenAmount"
                type="number"
                min="1"
                value={formData.tokenAmount}
                onChange={(e) => handleInputChange("tokenAmount", e.target.value)}
                placeholder="Enter number of tokens needed"
                required
              />
              {formData.tokenAmount && (
                <p className="text-sm text-muted-foreground">
                  Estimated cost: ${(Number.parseInt(formData.tokenAmount) * 0.1).toFixed(2)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose / Notes</Label>
              <Textarea
                id="purpose"
                value={formData.purpose}
                onChange={(e) => handleInputChange("purpose", e.target.value)}
                placeholder="Describe the purpose for this token request..."
                rows={4}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Submitting Request..." : "Submit Token Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
