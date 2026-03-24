"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Wallet,
  Eye,
  EyeOff,
  UploadCloud,
  CheckCircle2,
  FileText,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"

// -----------------------------
// Config & Types
// -----------------------------
type Step = 0 | 1 | 2 | 3
const STEPS = ["Create Account", "National ID", "Liveness", "Connect Wallet"]
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

const isAcceptedFile = (file: File | null) =>
  !!file && ACCEPTED_FILE_TYPES.includes(file.type)

type FormDataState = {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  nationalIdText: string
  nationalIdFile: File | null
  livenessPassed: boolean
  walletConnected: boolean
}

// -----------------------------
// Stepper UI
// -----------------------------
const Stepper = ({ step }: { step: Step }) => (
  <ol className="mb-6 grid grid-cols-4 gap-2">
    {STEPS.map((label, idx) => {
      const index = idx as Step
      const isActive = step === index
      const isDone = step > index
      return (
        <li
          key={label}
          className="flex items-center gap-2 rounded-md px-3 py-2 bg-muted"
          aria-current={isActive ? "step" : undefined}
        >
          <div
            className={`h-5 w-5 rounded-full text-xs flex items-center justify-center ${
              isDone
                ? "bg-primary text-primary-foreground"
                : isActive
                ? "bg-primary/80 text-primary-foreground"
                : "bg-muted-foreground/20 text-foreground"
            }`}
          >
            {isDone ? "✓" : idx + 1}
          </div>
          <span
            className={`text-xs font-medium ${
              isActive ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        </li>
      )
    })}
  </ol>
)

// -----------------------------
// Step 1: Account Creation
// -----------------------------
const StepCreateAccount = ({
  data,
  onChange,
  showPassword,
  showConfirmPassword,
  togglePassword,
  toggleConfirmPassword,
}: {
  data: FormDataState
  onChange: (field: keyof FormDataState, value: string) => void
  showPassword: boolean
  showConfirmPassword: boolean
  togglePassword: () => void
  toggleConfirmPassword: () => void
}) => (
  <div className="grid gap-4">
    {[
      { label: "Full Name", id: "fullName", placeholder: "Jane Doe" },
      { label: "Email", id: "email", placeholder: "jane@example.com", type: "email" },
    ].map(({ label, id, placeholder, type }) => (
      <div key={id} className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          placeholder={placeholder}
          type={type || "text"}
          value={(data as any)[id]}
          onChange={(e) => onChange(id as keyof FormDataState, e.target.value)}
        />
      </div>
    ))}

    <div className="space-y-2">
      <Label>Password</Label>
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          value={data.password}
          onChange={(e) => onChange("password", e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full"
          onClick={togglePassword}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
    </div>

    <div className="space-y-2">
      <Label>Confirm Password</Label>
      <div className="relative">
        <Input
          type={showConfirmPassword ? "text" : "password"}
          value={data.confirmPassword}
          onChange={(e) => onChange("confirmPassword", e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full"
          onClick={toggleConfirmPassword}
        >
          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Must match password</p>
    </div>
  </div>
)

// -----------------------------
// Step 2: National ID
// -----------------------------
const StepNationalId = ({
  data,
  onChange,
  fileInputRef,
}: {
  data: FormDataState
  onChange: (field: keyof FormDataState, value: string | File | null) => void
  fileInputRef: React.RefObject<HTMLInputElement>
}) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !isAcceptedFile(file)) return
    onChange("nationalIdFile", file)
  }

  return (
    <div className="grid gap-4">
      <div>
        <Label>National ID (Text)</Label>
        <Input
          placeholder="Enter your National ID"
          value={data.nationalIdText}
          onChange={(e) => onChange("nationalIdText", e.target.value)}
        />
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="rounded-lg border border-dashed p-6 text-center bg-card hover:bg-accent/40 transition-colors cursor-pointer"
      >
        <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Click or drag to upload</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={handleFileSelect}
        />
      </div>

      {data.nationalIdFile && (
        <div className="mt-3 flex items-center gap-3 rounded-md border p-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{data.nationalIdFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(data.nationalIdFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------
// Step 3: Liveness Verification
// -----------------------------
const StepLiveness = ({ passed, onPass }: { passed: boolean; onPass: () => void }) => (
  <div className="grid gap-4 text-center">
    {!passed ? (
      <Button
        onClick={() => {
          window.open("http://localhost:3000/api/liveness", "_blank")
          onPass()
        }}
      >
        Start Liveness Verification
      </Button>
    ) : (
      <div className="flex items-center justify-center gap-2 text-green-600">
        <CheckCircle2 className="h-5 w-5" />
        <p className="text-sm">Liveness Verified</p>
      </div>
    )}
  </div>
)

// -----------------------------
// Step 4: Wallet Connect
// -----------------------------
const StepWallet = ({
  connected,
  loading,
  onConnect,
}: {
  connected: boolean
  loading: boolean
  onConnect: () => void
}) => (
  <div className="text-center space-y-3">
    <Button
      onClick={onConnect}
      disabled={connected || loading}
      className="w-full"
      variant={connected ? "secondary" : "outline"}
    >
      <Wallet className="h-4 w-4 mr-2" />
      {loading ? "Connecting..." : connected ? "Wallet Connected" : "Connect Wallet"}
    </Button>
    {connected && (
      <p className="text-xs text-green-600">Wallet connection successful.</p>
    )}
  </div>
)

// -----------------------------
// Main Form
// -----------------------------
export function SignUpForm() {
  const router = useRouter()
  const { toast } = useToast()

  const [formData, setFormData] = useState<FormDataState>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    nationalIdText: "",
    nationalIdFile: null,
    livenessPassed: false,
    walletConnected: false,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (field: keyof FormDataState, value: string | File | null | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }))

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          formData.fullName.trim().length >= 2 &&
          isValidEmail(formData.email) &&
          formData.password.length >= 8 &&
          formData.password === formData.confirmPassword
        )
      case 1:
        return !!formData.nationalIdText && !!formData.nationalIdFile
      case 2:
        return formData.livenessPassed
      case 3:
        return formData.walletConnected
      default:
        return false
    }
  }, [step, formData])

  const notify = (title: string, desc?: string, variant: "default" | "destructive" = "default") =>
    toast({ title, description: desc, variant })

  const handleNext = () => (!stepValid ? notify("Please complete required fields.", "", "destructive") : setStep((s) => Math.min(s + 1, 3) as Step))
  const handleBack = () => setStep((s) => Math.max(s - 1, 0) as Step)

  const handleWalletConnect = async () => {
    try {
      setIsLoading(true)
      if (!(window as any).ethereum) throw new Error("No wallet detected.")
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" })
      if (accounts[0]) {
        setFormData((p) => ({ ...p, walletConnected: true }))
        notify("Wallet Connected", accounts[0])
      }
    } catch (err: any) {
      notify("Wallet Connection Failed", err.message, "destructive")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!stepValid) return notify("Complete all steps first.", "", "destructive")

    notify("Account Created", "Your account has been registered successfully.")
    router.push("/login")
  }

  // -----------------------------
  // Render Steps
  // -----------------------------
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Create your account</h2>
        <p className="text-sm text-muted-foreground">
          Complete all four steps to finish registration.
        </p>
      </div>

      <Stepper step={step} />

      {step === 0 && (
        <StepCreateAccount
          data={formData}
          onChange={handleChange}
          showPassword={showPassword}
          showConfirmPassword={showConfirmPassword}
          togglePassword={() => setShowPassword((s) => !s)}
          toggleConfirmPassword={() => setShowConfirmPassword((s) => !s)}
        />
      )}
      {step === 1 && (
        <StepNationalId
          data={formData}
          onChange={handleChange}
          fileInputRef={fileInputRef}
        />
      )}
      {step === 2 && (
        <StepLiveness
          passed={formData.livenessPassed}
          onPass={() => handleChange("livenessPassed", Boolean(true))}
        />
      )}
      {step === 3 && (
        <StepWallet
          connected={formData.walletConnected}
          loading={isLoading}
          onConnect={handleWalletConnect}
        />
      )}

      <div className="mt-4 flex justify-between items-center">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {step < 3 ? (
          <Button type="button" onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button type="submit" className="gap-2">
            Create Account
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  )
}
