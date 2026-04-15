"use client"

import type React from "react"
import { useState, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Wallet, Eye, EyeOff, UploadCloud, CheckCircle2, FileText, ArrowLeft, ArrowRight, AlertCircle } from "lucide-react"
import { apiClient } from "@/lib/api-client"

type Step = 0 | 1 | 2 | 3

const STEPS = ["Create Account", "National ID", "Liveness", "Connect Wallet"]

const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

const isAcceptedFile = (file: File | null) => {
  if (!file) return false
  const byMime = ACCEPTED_FILE_TYPES.includes(file.type)
  if (byMime) return true
  const name = (file.name || "").toLowerCase()
  return name.endsWith(".pdf") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")
}

type FormDataState = {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  nationalIdText: string
  nationalIdFile: File | null
  livenessPassed: boolean
  faceDescriptor: number[] | null
  walletConnected: boolean
}

const Stepper = ({ step }: { step: Step }) => {
  return (
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
              className={
                "h-5 w-5 rounded-full text-xs flex items-center justify-center " +
                (isDone
                  ? "bg-primary text-primary-foreground"
                  : isActive
                    ? "bg-primary/80 text-primary-foreground"
                    : "bg-muted-foreground/20 text-foreground")
              }
            >
              {isDone ? "✓" : idx + 1}
            </div>
            <span className={"text-xs font-medium " + (isActive ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const StepCreateAccount = ({
  formData,
  handleInputChange,
  showPassword,
  showConfirmPassword,
  onToggleShowPassword,
  onToggleShowConfirmPassword,
  errors,
}: {
  formData: FormDataState
  handleInputChange: (field: keyof FormDataState, value: string) => void
  showPassword: boolean
  showConfirmPassword: boolean
  onToggleShowPassword: () => void
  onToggleShowConfirmPassword: () => void
  errors: any
}) => (
  <div className="grid gap-4">
    <div className="space-y-2">
      <Label htmlFor="fullName">Full Name</Label>
      <Input
        id="fullName"
        placeholder="Jane Doe"
        value={formData.fullName}
        onChange={(e) => handleInputChange("fullName", e.target.value)}
        className={errors.fullName ? "border-red-500/50 ring-red-500/20" : ""}
        required
      />
      {errors.fullName && <p className="text-[11px] text-red-500 font-medium">Use 2-4 words, letters only (First Middle Last)</p>}
    </div>

    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        placeholder="jane@example.com"
        value={formData.email}
        onChange={(e) => handleInputChange("email", e.target.value)}
        className={errors.email ? "border-red-500/50 ring-red-500/20" : ""}
        required
      />
      {errors.email && <p className="text-[11px] text-red-500 font-medium">Enter a valid professional email address</p>}
    </div>

    <div className="space-y-2">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          value={formData.password}
          onChange={(e) => handleInputChange("password", e.target.value)}
          className={errors.password ? "border-red-500/50 ring-red-500/20" : ""}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={onToggleShowPassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground font-medium">Minimum 8 characters required</p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="confirmPassword">Confirm Password</Label>
      <div className="relative">
        <Input
          id="confirmPassword"
          type={showConfirmPassword ? "text" : "password"}
          value={formData.confirmPassword}
          onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
          className={errors.confirmPassword ? "border-red-500/50 ring-red-500/20" : ""}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={onToggleShowConfirmPassword}
          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
        >
          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {errors.confirmPassword && <p className="text-[11px] text-red-500 font-medium">Passwords do not match</p>}
    </div>
  </div>
)

const StepNationalId = ({
  formData,
  handleInputChange,
  handleFileDrop,
  handleFileSelect,
  fileInputRef,
  errors,
}: {
  formData: FormDataState
  handleInputChange: (field: keyof FormDataState, value: string | File | null) => void
  handleFileDrop: (e: React.DragEvent<HTMLDivElement>) => void
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  errors: any
}) => (
  <div className="grid gap-4">
    <div className="space-y-2">
      <Label htmlFor="nationalIdText">National ID (Text)</Label>
      <Input
        id="nationalIdText"
        placeholder="Enter your National ID"
        value={formData.nationalIdText}
        onChange={(e) => handleInputChange("nationalIdText", e.target.value)}
        className={errors.nationalId ? "border-red-500/50 ring-red-500/20 text-red-500" : ""}
        required
      />
      {errors.nationalId && <p className="text-[11px] text-red-500 font-medium">Required: 6-20 alphanumeric characters</p>}
    </div>

    <div className="space-y-2">
      <Label>Upload National ID (PDF/JPG/PNG)</Label>
      {!formData.nationalIdFile && formData.nationalIdText && (
        <div className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-500">
          <AlertCircle className="h-3 w-3" />
          <span>Form data restored, but your <strong>National ID File</strong> must be re-uploaded.</span>
        </div>
      )}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        className="rounded-lg border border-dashed p-6 text-center bg-card hover:bg-accent/20 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label="Drop your ID document here or click to browse"
      >
        <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Drag & drop or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={handleFileSelect}
        />
      </div>

      {formData.nationalIdFile && (
        <div className="mt-3 flex items-center gap-3 rounded-md border p-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">{formData.nationalIdFile.name}</p>
            <p className="text-muted-foreground">{(formData.nationalIdFile.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
      )}
    </div>
  </div>
)

import { FaceLivenessScan } from "./face-liveness-scan"

const StepLiveness = ({
  livenessPassed,
  onPass,
}: {
  livenessPassed: boolean
  onPass: (descriptor: number[]) => void
}) => (
  <div className="grid gap-4">
    {!livenessPassed ? (
      <FaceLivenessScan onPassed={onPass} />
    ) : (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-primary/20 p-8 bg-primary/5 shadow-inner">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Identity Verified</p>
          <p className="text-sm text-muted-foreground mt-1">Liveness check completed successfully.</p>
        </div>
      </div>
    )}
  </div>
)

const StepWallet = ({
  walletConnected,
  isLoading,
  handleWalletConnect,
}: {
  walletConnected: boolean
  isLoading: boolean
  handleWalletConnect: () => void
}) => (
  <div className="grid gap-4">
    <div className="space-y-2">
      <Label>Blockchain Wallet</Label>
      <div className="p-3 mb-2 rounded-lg border border-primary/20 bg-primary/5 text-[11px] text-muted-foreground flex items-start gap-2">
        <AlertCircle className="h-3 w-3 mt-0.5 text-primary shrink-0" />
        <span>
          <strong>Identity Binding</strong>: Please select the MetaMask account containing your test BNB.
          The popup will let you pick which account to link to this BBSNS ID.
        </span>
      </div>
      <Button
        type="button"
        variant={walletConnected ? "secondary" : "outline"}
        onClick={handleWalletConnect}
        disabled={isLoading || walletConnected}
        className="w-full"
      >
        <Wallet className="h-4 w-4 mr-2" />
        {isLoading ? "Connecting..." : walletConnected ? "Wallet Connected" : "Connect Wallet"}
      </Button>
    </div>
    {walletConnected && localStorage.getItem("connectedWallet") && (
      <p className="text-xs text-muted-foreground">
        Connected: {localStorage.getItem("connectedWallet")?.substring(0, 6)}...{localStorage.getItem("connectedWallet")?.substring(38)}
      </p>
    )}
  </div>
)

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
    faceDescriptor: null,
    walletConnected: false,
    hasSigned: false // 🛡️ [SENTINEL_3.1]
  })

  const [signature, setSignature] = useState("")
  const [nonce, setNonce] = useState("")

  // 🛡️ [SENTINEL_3.1] Mutation Locking Effect
  // Automatically invalidates signature if ANY linked identity field changes.
  useEffect(() => {
    if (signature) {
      console.log("[SENTINEL] Identity field mutation detected. Invalidating signature to maintain cryptographic intent.");
      setSignature("");
      setNonce("");
    }
  }, [formData.fullName, formData.email, formData.nationalIdText]);

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Restore form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('signupFormData')
    const savedStep = localStorage.getItem('signupFormStep')

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        const now = Date.now()
        
        // 🛡️ [Hardening] Check for 24h Expiry
        if (now - (parsed.timestamp || 0) > 24 * 60 * 60 * 1000) {
          localStorage.removeItem('signupFormData')
          localStorage.removeItem('signupFormStep')
          console.log("[GUARD] Registration draft expired.")
          return
        }

        setFormData(prev => ({
          ...prev,
          fullName: parsed.fullName || "",
          email: parsed.email || "",
          password: "", // 🛡️ CRITICAL: NEVER RESTORE PASSWORD FROM STORAGE
          confirmPassword: "",
          nationalIdText: parsed.nationalIdText || "",
          livenessPassed: parsed.livenessPassed || false,
          faceDescriptor: parsed.faceDescriptor || null,
          walletConnected: parsed.walletConnected || false,
          // Note: File cannot be persisted in localStorage
        }))

        // Show toast to inform user their data was restored
        if (parsed.fullName || parsed.email) {
          toast({
            title: "Form Data Restored",
            description: "Your previous form data has been recovered.",
            duration: 3000,
          })
        }
      } catch (err) {
        console.error("Failed to restore form data:", err)
      }
    }

    if (savedStep) {
      setStep(parseInt(savedStep) as Step)
    }

    // 🛡️ [Hardening] Guide if draft is invalid
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const nameWords = (parsed.fullName || "").trim().split(/\s+/).length;
        const isDraftValid = /^[A-Za-z]+([ .'-][A-Za-z]+)*$/.test(parsed.fullName || "") && 
                           nameWords >= 2 && nameWords <= 4 &&
                           /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(parsed.email || "");
        
        if (!isDraftValid && parsed.fullName) {
          toast({ title: "Draft Found", description: "Some fields in your saved draft need correction for domain validity.", variant: "default" });
        }
      } catch (e) {}
    }
  }, [toast])

  const REGEX = {
    NAME: /^[A-Za-z]+([ .'-][A-Za-z]+)*$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    ALPHA_NUMERIC: /^[A-Za-z0-9]{6,20}$/
  };

  const validationErrors = {
    fullName: formData.fullName && (!REGEX.NAME.test(formData.fullName) || formData.fullName.trim().split(/\s+/).length > 4 || formData.fullName.trim().split(/\s+/).length < 2),
    email: formData.email && !REGEX.EMAIL.test(formData.email),
    password: formData.password && formData.password.length < 8,
    confirmPassword: formData.confirmPassword && formData.confirmPassword !== formData.password,
    nationalId: formData.nationalIdText && (!REGEX.ALPHA_NUMERIC.test(formData.nationalIdText) || formData.nationalIdText.length < 6)
  };

  // 🛡️ [Hardening] Debounced Save (Security: No Passwords)
  useEffect(() => {
    const timer = setTimeout(() => {
      const dataToSave = {
        fullName: formData.fullName,
        email: formData.email,
        nationalIdText: formData.nationalIdText,
        livenessPassed: formData.livenessPassed,
        faceDescriptor: formData.faceDescriptor,
        walletConnected: formData.walletConnected,
        timestamp: Date.now()
        // 🛡️ CRITICAL: PASSWORDS EXCLUDED FROM PERSISTENCE
      }

      localStorage.setItem('signupFormData', JSON.stringify(dataToSave))
      localStorage.setItem('signupFormStep', step.toString())
    }, 500) // 500ms Debounce

    return () => clearTimeout(timer)
  }, [formData, step])


  const handleWalletConnect = async () => {
    console.log("[WALLET] Starting connection process...");

    // Check for mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (!window.ethereum) {
      console.log("[WALLET] window.ethereum not found. User on mobile:", isMobile);
      
      if (isMobile) {
        // Force MetaMask app to open via custom scheme and universal link fallback
        const currentUrl = window.location.href.replace(/^https?:\/\//, '');
        const metamaskAppDeepLink = `https://metamask.app.link/dapp/${currentUrl}`;
        const metamaskCustomScheme = `metamask://dapp/${currentUrl}`;
        
        toast({
          title: "Connecting to MetaMask...",
          description: "If the app doesn't open automatically, please tap the link to open MetaMask.",
        });
        
        // Try Universal Link first, then Custom Scheme
        setTimeout(() => {
            window.location.href = metamaskAppDeepLink;
            // Fallback for some browsers that block universal links
            setTimeout(() => {
                window.location.href = metamaskCustomScheme;
            }, 1000);
        }, 500);
        return;
      }

      console.error("[WALLET] MetaMask not found in window.ethereum (Desktop)");
      toast({
        title: "MetaMask Not Found",
        description: "Please install MetaMask browser extension and refresh this page.",
        variant: "destructive",
      });
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    setIsLoading(true);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(window.ethereum as any);

      // BNB Testnet Configuration (Generalized)
      const targetChainInt = 97; // Fallback or fetch from SSoT
      const BNB_TESTNET_CHAIN_ID = `0x${targetChainInt.toString(16)}`; 
      const BNB_TESTNET_CONFIG = {
        chainId: BNB_TESTNET_CHAIN_ID,
        chainName: 'BNB Smart Chain Testnet',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'tBNB',
          decimals: 18
        },
        rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
        blockExplorerUrls: ['https://testnet.bscscan.com']
      };

      console.log("[WALLET] Checking current network...");

      // Get current chain ID
      let currentChainId;
      try {
        currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        console.log("[WALLET] Current chain ID:", currentChainId);
      } catch (err) {
        console.error("[WALLET] Failed to get chain ID:", err);
      }

      // Check if user is on BNB Testnet
      if (currentChainId !== BNB_TESTNET_CHAIN_ID) {
        console.log("[WALLET] Not on BNB Testnet, attempting to switch...");

        try {
          // Try to switch to BNB Testnet
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BNB_TESTNET_CHAIN_ID }],
          });
          console.log("[WALLET] Successfully switched to BNB Testnet");
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            console.log("[WALLET] BNB Testnet not found, adding network...");
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [BNB_TESTNET_CONFIG],
              });
              console.log("[WALLET] BNB Testnet added successfully");
            } catch (addError) {
              console.error("[WALLET] Failed to add BNB Testnet:", addError);
              toast({
                title: "Network Setup Failed",
                description: "Please manually add BNB Smart Chain Testnet to MetaMask.",
                variant: "destructive",
              });
              setIsLoading(false);
              return;
            }
          } else {
            console.error("[WALLET] Failed to switch network:", switchError);
            toast({
              title: "Network Switch Required",
              description: "Please switch to BNB Smart Chain Testnet in MetaMask.",
              variant: "destructive",
            });
            setIsLoading(false);
            localStorage.removeItem('signupFormData')
            localStorage.removeItem('signupFormStep')
            router.push("/documents")
            return;
          }
        }
      }

      console.log("[WALLET] Requesting accounts with permission (wallet_requestPermissions)...");

      // Task: Forced Account Selection
      // By requesting eth_accounts permission, we force MetaMask to show the account picker
      // even if the wallet is already connected.
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (permErr: any) {
        console.warn("[WALLET] Permission request failed or rejected:", permErr);
        if (permErr.code === 4001) {
          throw new Error("Account selection was cancelled. Please pick the correct account to proceed.");
        }
      }

      let accounts: string[];
      try {
        accounts = await provider.send("eth_requestAccounts", []);
        console.log("[WALLET] Accounts received:", accounts);
      } catch (sendErr: any) {
        console.warn("[WALLET] eth_requestAccounts failed, attempting fallback...", sendErr);
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      }

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask and try again.");
      }

      const walletAddress = accounts[0];
      console.log("[WALLET] Successfully bound to:", walletAddress);

      localStorage.setItem("connectedWallet", walletAddress);
      setFormData((prev) => ({ ...prev, walletConnected: true }));

      toast({
        title: "✅ Wallet Connected",
        description: `Connected: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`,
      });
    } catch (err: any) {
      console.error("[WALLET] Critical connection error:", err);

      let errorMessage = "Failed to connect wallet.";
      if (err.code === 4001) {
        errorMessage = "Connection request was rejected in MetaMask.";
      } else if (err.code === -32002) {
        errorMessage = "Connection request already pending. Please check MetaMask.";
      } else if (err.message?.includes("User rejected")) {
        errorMessage = "You cancelled the connection request.";
      } else {
        errorMessage = err.message || "Unknown interaction error.";
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormDataState, value: any) => {
    let filteredValue = value;

    if (typeof value === 'string') {
      if (field === "fullName") {
        // Enforce ^[A-Za-z\s.'-]{2,50}$
        filteredValue = value.replace(/[^A-Za-z\s.'-]/g, "").slice(0, 50);
      } else if (field === "nationalIdText") {
        // Enforce alphanumeric 6-20
        filteredValue = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 20);
      } else if (field === "email") {
        // Normalize: lowercase, no spaces
        filteredValue = value.toLowerCase().replace(/\s/g, "");
      }
    }

    setFormData((prev) => ({ ...prev, [field]: filteredValue }))
  }

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const stepValid = useMemo(() => {
    switch (step) {
      case 0: {
        const nameWords = formData.fullName.trim().split(/\s+/).length;
        return (
          REGEX.NAME.test(formData.fullName) &&
          nameWords >= 2 && nameWords <= 4 &&
          REGEX.EMAIL.test(formData.email) &&
          formData.password.length >= 8 &&
          formData.password === formData.confirmPassword
        )
      }
      case 1:
        return formData.nationalIdText.length >= 6 && REGEX.ALPHA_NUMERIC.test(formData.nationalIdText) && !!formData.nationalIdFile
      case 2:
        return formData.livenessPassed && !!formData.faceDescriptor
      case 3:
        return formData.walletConnected
      default:
        return false
    }
  }, [step, formData, REGEX])

  const showStepError = () => {
    if (step === 0) {
      if (!formData.fullName.trim()) {
        toast({ title: "Registration Error", description: "Full name is required", variant: "destructive" })
        return
      }
      if (!isValidEmail(formData.email)) {
        toast({ title: "Registration Error", description: "Invalid email address format", variant: "destructive" })
        return
      }
      if (formData.password.length < 8) {
        toast({
          title: "Registration Error",
          description: "Password is too short. Use at least 8 characters.",
          variant: "destructive",
        })
        return
      }
      if (formData.password !== formData.confirmPassword) {
        toast({
          title: "Registration Error",
          description: "Passwords do not match.",
          variant: "destructive",
        })
        return
      }
    }
    if (step === 1) {
      if (!formData.nationalIdText.trim()) {
        toast({ title: "Registration Error", description: "National ID number is required", variant: "destructive" })
        return
      }
      if (!formData.nationalIdFile) {
        toast({
          title: "Registration Error",
          description: "Please re-upload your National ID document (files cannot be saved in browser cache).",
          variant: "destructive"
        })
        return
      }
      if (!isAcceptedFile(formData.nationalIdFile)) {
        toast({
          title: "Registration Error",
          description: "Unsupported file type. Only PDF, JPG, JPEG, or PNG are allowed.",
          variant: "destructive",
        })
        return
      }
    }
    if (step === 2) {
      if (!formData.livenessPassed) {
        toast({
          title: "Setup Incomplete",
          description: "Please complete the secure liveness scanner to continue.",
          variant: "destructive",
        })
        return
      }
    }
    if (step === 3) {
      if (!formData.walletConnected) {
        toast({
          title: "Security Requirement",
          description: "Please connect your blockchain wallet to link your identity.",
          variant: "destructive",
        })
        return
      }
    }
  }

  const handleNext = () => {
    if (!stepValid) {
      showStepError()
      return
    }
    setStep((s) => {
      const next = Math.min(s + 1, 3)
      return next as Step
    })
  }

  const handleBack = () => {
    setStep((s) => {
      const prev = Math.max(s - 1, 0)
      return prev as Step
    })
  }



  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!isAcceptedFile(file)) {
      toast({
        title: "Unsupported file type",
        description: "Only PDF, JPG, JPEG, or PNG are allowed.",
        variant: "destructive",
      })
      return
    }
    handleInputChange("nationalIdFile", file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isAcceptedFile(file)) {
      toast({
        title: "Unsupported file type",
        description: "Only PDF, JPG, JPEG, or PNG are allowed.",
        variant: "destructive",
      })
      return
    }
    handleInputChange("nationalIdFile", file)
  }

  const handleFinalSubmission = async () => {
    // Task: Ensure we are actually on the final step
    if (step !== 3) {
      console.warn("[SIGNUP-GUARD] Final submission ignored for step:", step);
      return;
    }

    if (!formData.fullName.trim()) {
      toast({ title: "Submission Failed", description: "Final check failed: Full name is missing.", variant: "destructive" })
      setStep(0);
      return
    }
    if (!isValidEmail(formData.email)) {
      toast({ title: "Submission Failed", description: "Final check failed: Invalid email format.", variant: "destructive" })
      setStep(0);
      return
    }
    if (formData.password.length < 8) {
      toast({ title: "Submission Failed", description: "Final check failed: Password too short.", variant: "destructive" })
      setStep(0);
      return
    }
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Submission Failed", description: "Final check failed: Passwords mismatch.", variant: "destructive" })
      setStep(0);
      return
    }
    if (!formData.nationalIdText.trim() || !formData.nationalIdFile) {
      toast({ title: "Submission Failed", description: "Final check failed: National ID document missing.", variant: "destructive" })
      setStep(1);
      return
    }
    if (!formData.livenessPassed || !formData.faceDescriptor) {
      toast({ title: "Submission Failed", description: "Final check failed: Liveness verification data missing.", variant: "destructive" })
      setStep(2);
      return
    }
    if (!formData.walletConnected) {
      toast({ title: "Submission Failed", description: "Your wallet must be connected before you can create an account.", variant: "destructive" })
      setStep(3);
      return
    }

    setIsLoading(true)

    // 🛡️ [Hardening] Backend Authority ensures frontend is a dumb signer.
    // Replaced legacy payload normalization, canonicalization, and hashing with message_template.

    // 🛡️ [SENTINEL_3.1] Use local states instead of shadowing
    let finalSignature = ""
    let receivedNonce = ""

    try {
      console.log("[SIGNUP] Initiating signature flow...");

      const walletAddress = localStorage.getItem("connectedWallet");
      if (!walletAddress) throw new Error("Wallet not connected. Please go back and connect your wallet.");

      // 1. Get Nonce & Canonical Challenge Template
      console.log("[SIGNUP] Fetching nonce for address:", walletAddress);
      
      const payloadObj = {
        fullName: formData.fullName,
        email: formData.email,
        nationalIdText: formData.nationalIdText
      };
      
      const { nonce, message_template } = await apiClient.post('/auth/nonce', {
          wallet_address: walletAddress,
          purpose: 'REGISTER',
          payload: payloadObj,
          version: 'v1'
      });
      if (!nonce || !message_template) throw new Error("Invalid server response (missing auth template)");
      receivedNonce = nonce;
      
      console.log("[SIGNUP] Received authoritative challenge template from backend:", message_template);
      
      console.log("[SIGNUP] Prompting for signature in MetaMask...");
      const { ethers } = await import("ethers")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner()

      // Verify signer matches the address we used for the nonce
      const currentSignerAddress = await signer.getAddress();
      if (currentSignerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        console.warn("[SIGNUP] Signer mismatch!", { current: currentSignerAddress, expected: walletAddress });
        localStorage.setItem("connectedWallet", currentSignerAddress);
        throw new Error(`Wallet address changed in MetaMask to ${currentSignerAddress}. Please check your selection and try again.`);
      }

      finalSignature = await signer.signMessage(message_template);
      console.log("[SIGNUP] Signature acquired successfully.");
      
      // 🛡️ [SENTINEL_3.1] Persist to component state for submission
      setSignature(finalSignature);
      setNonce(receivedNonce);

    } catch (sigErr: any) {
      console.error("[SIGNUP] Signature/Nonce failed:", sigErr)
      let errorMsg = sigErr.message || "Failed to sign registration challenge.";
      if (sigErr.code === 4001) errorMsg = "Signature request was rejected in MetaMask.";
      toast({
        title: "Security & Signature Error",
        description: errorMsg,
        variant: "destructive",
      })
      setIsLoading(false)
      return
    }

    try {
      // 4. Submit Normalized Payload
      const signupForm = new FormData();
      signupForm.append('fullName', formData.fullName);
      signupForm.append('email', formData.email);
      signupForm.append('password', formData.password);
      signupForm.append('nationalIdText', formData.nationalIdText);
      if (formData.nationalIdFile) {
        signupForm.append('nationalIdFile', formData.nationalIdFile);
      }
      signupForm.append('faceDescriptor', JSON.stringify(formData.faceDescriptor));
      signupForm.append('walletAddress', localStorage.getItem("connectedWallet") || "");
      signupForm.append('signature', finalSignature);
      signupForm.append('nonce', receivedNonce);
      signupForm.append('version', 'v1');
      // 🛡️ [Hardening] Assert backward compatibility branch on the backend
      signupForm.append('backendChallenge', 'true');

      await apiClient.post('/users/register', signupForm);

      toast({
        title: "Account Created",
        description: "Your account has been created successfully. Please sign in.",
      })

      // Clear saved form data after successful signup
      localStorage.removeItem('signupFormData')
      localStorage.removeItem('signupFormStep')

      router.push("/login")
    } catch (err: any) {
      toast({
        title: "Registration Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && (
        <StepCreateAccount
          formData={formData as FormDataState}
          handleInputChange={(field, value) => handleInputChange(field as keyof typeof formData, value)}
          showPassword={showPassword}
          showConfirmPassword={showConfirmPassword}
          onToggleShowPassword={() => setShowPassword((s) => !s)}
          onToggleShowConfirmPassword={() => setShowConfirmPassword((s) => !s)}
          errors={validationErrors}
        />
      )}
      {step === 1 && (
        <StepNationalId
          formData={formData as FormDataState}
          handleInputChange={(field, value) => handleInputChange(field as keyof typeof formData, value)}
          handleFileDrop={handleFileDrop}
          handleFileSelect={handleFileSelect}
          fileInputRef={fileInputRef}
          errors={validationErrors}
        />
      )}
      {step === 2 && (
        <StepLiveness
          livenessPassed={formData.livenessPassed}
          onPass={(descriptor) =>
            setFormData((p) => {
              return { ...p, livenessPassed: true, faceDescriptor: descriptor }
            })
          }
        />
      )}
      {step === 3 && (
        <StepWallet
          walletConnected={formData.walletConnected}
          isLoading={isLoading}
          handleWalletConnect={handleWalletConnect}
        />
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0 || isLoading} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step < 3 ? (
          <Button
            type="button"
            onClick={handleNext}
            className="gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            disabled={!stepValid || isLoading}
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button 
            type="button" 
            onClick={handleFinalSubmission} 
            className="gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed" 
            disabled={!stepValid || isLoading}
          >
            {isLoading ? "Creating Account..." : "Finalize Registration"}
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-8 text-center space-y-3 pt-6 border-t border-border/40">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
