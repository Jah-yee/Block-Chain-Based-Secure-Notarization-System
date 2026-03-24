"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "@/components/ui/progress"
import { Wallet, Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react"

type LoginStep = "credentials" | "verification" | "wallet"

export function LoginForm() {
  const [currentStep, setCurrentStep] = useState<LoginStep>("credentials")
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

  const steps: { key: LoginStep; title: string; description: string }[] = [
    { key: "credentials", title: "Credentials", description: "Enter your username and password" },
    { key: "verification", title: "ID Verification", description: "Verify your national ID" },
    { key: "wallet", title: "Wallet Connection", description: "Connect your blockchain wallet" },
  ]

  const currentStepIndex = steps.findIndex((step) => step.key === currentStep)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNext = () => {
    if (currentStep === "credentials") {
      if (!formData.username || !formData.password) {
        toast({
          title: "Missing Information",
          description: "Please enter both username and password.",
          variant: "destructive",
        })
        return
      }
      setCurrentStep("verification")
    } else if (currentStep === "verification") {
      if (!formData.nationalId) {
        toast({
          title: "ID Required",
          description: "Please enter your national ID.",
          variant: "destructive",
        })
        return
      }
      setCurrentStep("wallet")
    }
  }

  const handleBack = () => {
    if (currentStep === "verification") {
      setCurrentStep("credentials")
    } else if (currentStep === "wallet") {
      setCurrentStep("verification")
    }
  }

  const handleWalletConnect = () => {
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

  const handleLogin = () => {
    if (!formData.walletConnected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your blockchain wallet to complete login.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Login Successful",
      description: "Welcome back to BBSNS!",
    })
    router.push("/dashboard")
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case "credentials":
        return (
          <div className="space-y-4">
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
            </div>
          </div>
        )

      case "verification":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nationalId">National ID</Label>
              <Input
                id="nationalId"
                value={formData.nationalId}
                onChange={(e) => handleInputChange("nationalId", e.target.value)}
                placeholder="Enter your national ID number"
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This information is used to verify your identity and ensure secure access to your account.
            </p>
          </div>
        )

      case "wallet":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Blockchain Wallet Connection</Label>
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
            {formData.walletConnected && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Wallet Address: 0x1234...5678 (Mock Address)</p>
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          <span className="text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold">{steps[currentStepIndex].title}</h3>
        <p className="text-sm text-muted-foreground">{steps[currentStepIndex].description}</p>
      </div>

      {renderStepContent()}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={handleBack} disabled={currentStep === "credentials"}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {currentStep === "wallet" ? (
          <Button onClick={handleLogin} disabled={!formData.walletConnected}>
            Sign In
          </Button>
        ) : (
          <Button onClick={handleNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
