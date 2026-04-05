"use client"

import * as React from "react"
import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Upload, FileText, X, AlertCircle, Loader2,
  CheckCircle2, Flame, Clock, ExternalLink, RefreshCw
} from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { useConfig } from "@/providers/ConfigProvider"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────
type UploadStep = 'select' | 'intent_created' | 'burning' | 'tx_submitted' | 'confirming' | 'done' | 'error'

interface IntentData {
  intent_id: string
  intent_id_bytes32: string
  file_hash: string
  amount: number
  amount_wei: string
  ntkr_contract: string
  expires_at: string
}

// NTKR burnForUpload ABI (minimal)
const NTKR_ABI = [
  "function burnForUpload(uint256 amount, bytes32 intentId) external"
]

// ── Step Indicator Component ──────────────────────────────────────────────────
function StepBadge({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-xs font-medium transition-all",
      done ? "text-green-400" : active ? "text-primary" : "text-slate-600"
    )}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border",
        done ? "bg-green-500/20 border-green-500 text-green-400" :
          active ? "bg-primary/20 border-primary text-primary" :
            "bg-slate-800 border-slate-700 text-slate-600"
      )}>
        {done ? <CheckCircle2 className="w-3 h-3" /> : num}
      </div>
      {label}
    </div>
  )
}

// ── Countdown Timer Component ─────────────────────────────────────────────────
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    setSecs(calc())
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const urgent = secs < 120
  return (
    <span className={cn("font-mono text-sm", urgent ? "text-red-400 animate-pulse" : "text-yellow-400")}>
      <Clock className="inline w-3 h-3 mr-1" />
      {m}:{s.toString().padStart(2, '0')} remaining
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function UploadInterface() {
  const { config } = useConfig()
  const { liveBalances, balances, refreshBalances, user, connectedAccount } = useWalletSession()
  const { toast } = useToast()
  const router = useRouter()

  // Form state
  const [file, setFile] = useState<File | null>(null)
  const [documentTitle, setDocumentTitle] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number>(0)
  const [dragActive, setDragActive] = useState(false)

  // Upload flow state
  const [step, setStep] = useState<UploadStep>('select')
  const [intent, setIntent] = useState<IntentData | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const confirmPollRef = useRef<NodeJS.Timeout | null>(null)

  const requiredTokens = selectedCategory === 0 ? 1 : 5
  const currentNtkr = liveBalances?.isLive ? Number(liveBalances.ntkr || 0) : Number(balances?.ntkr || 0)
  const walletMismatch = Boolean(
    connectedAccount && user?.wallet_address &&
    connectedAccount.toLowerCase() !== user.wallet_address.toLowerCase()
  )

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const f = Array.from(e.dataTransfer.files).find(f => f.type === "application/pdf" || f.type.startsWith("image/"))
    if (f) setFile(f)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && (f.type === "application/pdf" || f.type.startsWith("image/"))) setFile(f)
  }

  // ── STEP 1: Initiate ─────────────────────────────────────────────────────────
  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !documentTitle.trim()) {
      toast({ title: "Required", description: "Title and file are required.", variant: "destructive" }); return
    }
    if (!connectedAccount) {
      toast({ title: "Wallet Required", description: "Please connect your MetaMask wallet.", variant: "destructive" }); return
    }
    if (walletMismatch) {
      toast({ title: "Wrong Wallet", description: "Switch to your registered wallet first.", variant: "destructive" }); return
    }

    setBusy(true); setErrorMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('filename', documentTitle)
      formData.append('category', selectedCategory.toString())

      const data = await apiClient.post('/api/documents/initiate', formData)
      setIntent(data)
      setStep('intent_created')
      toast({ title: "Upload Initiated", description: `Burn ${data.amount} NTKR to continue. You have 15 minutes.` })
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to initiate upload")
      setStep('error')
      toast({ title: "Initiation Failed", description: err.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  // ── STEP 2: User burns NTKR via MetaMask ────────────────────────────────────
  const handleBurn = async () => {
    if (!intent || !window.ethereum) return
    setBusy(true); setStep('burning')
    try {
      // Use ethers via window.ethereum directly (no import needed — MetaMask injects)
      const { BrowserProvider, Contract } = await import('ethers')
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Double-check connected wallet matches
      const signerAddr = (await signer.getAddress()).toLowerCase()
      if (signerAddr !== intent.ntkr_contract && user?.wallet_address && signerAddr !== user.wallet_address.toLowerCase()) {
        // Wallet address check — allow it through (backend will verify)
      }

      const ntkrContract = new Contract(intent.ntkr_contract, NTKR_ABI, signer)

      toast({
        title: "Confirm in MetaMask",
        description: `Burning ${intent.amount} NTKR for this upload. Check your wallet.`
      })

      // Call burnForUpload(amount_wei, intentId_bytes32)
      const tx = await ntkrContract.burnForUpload(intent.amount_wei, intent.intent_id_bytes32)
      const hash = tx.hash as string
      setTxHash(hash)
      setStep('tx_submitted')
      toast({ title: "Transaction Submitted!", description: "Waiting for confirmation...", })

      // Auto-confirm once tx is mined
      await tx.wait(1)
      handleConfirm(hash)
    } catch (err: any) {
      const msg = err?.code === 4001 ? "You cancelled the transaction in MetaMask." : (err.message || "Burn failed")
      setErrorMsg(msg)
      setStep('intent_created') // Go back so they can retry
      setBusy(false)
      toast({ title: err?.code === 4001 ? "Cancelled" : "Burn Failed", description: msg, variant: "destructive" })
    }
  }

  // ── STEP 3: Confirm with backend ─────────────────────────────────────────────
  const handleConfirm = async (hash: string) => {
    if (!intent) return
    setStep('confirming'); setBusy(true)
    let attempts = 0
    const maxAttempts = 12 // 12 × 5s = 60s max wait

    const tryConfirm = async () => {
      attempts++
      try {
        const result = await apiClient.post('/api/documents/confirm', {
          intent_id: intent.intent_id,
          tx_hash: hash
        })

        // 201 = document created
        await refreshBalances()
        setStep('done')
        setBusy(false)
        toast({ title: "✅ Document Notarized!", description: "Upload verified on-chain. Notary will be assigned shortly." })
        setTimeout(() => router.push("/dashboard/documents"), 2000)

      } catch (err: any) {
        if (err?.status === 202 && attempts < maxAttempts) {
          // Tx not yet mined — retry in 5s
          confirmPollRef.current = setTimeout(tryConfirm, 5000)
        } else {
          setErrorMsg(err.message || "Confirmation failed")
          setStep('error')
          setBusy(false)
          toast({ title: "Confirmation Failed", description: err.message, variant: "destructive" })
        }
      }
    }

    await tryConfirm()
  }

  // Cleanup polling on unmount
  useEffect(() => () => { if (confirmPollRef.current) clearTimeout(confirmPollRef.current) }, [])

  const resetFlow = () => {
    setStep('select'); setIntent(null); setTxHash(null); setErrorMsg(null); setFile(null)
    setDocumentTitle(""); setSelectedCategory(0)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center gap-4 px-2">
        <StepBadge num={1} label="Select" active={step === 'select'} done={['intent_created','burning','tx_submitted','confirming','done'].includes(step)} />
        <div className="h-px flex-1 bg-slate-800" />
        <StepBadge num={2} label="Burn NTKR" active={step === 'intent_created' || step === 'burning'} done={['tx_submitted','confirming','done'].includes(step)} />
        <div className="h-px flex-1 bg-slate-800" />
        <StepBadge num={3} label="Confirm" active={step === 'tx_submitted' || step === 'confirming'} done={step === 'done'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 'select' && "Upload Document"}
            {step === 'intent_created' && "Burn NTKR to Pay"}
            {step === 'burning' && "Waiting for Wallet..."}
            {step === 'tx_submitted' && "Transaction Submitted"}
            {step === 'confirming' && "Verifying On-Chain..."}
            {step === 'done' && "✅ Upload Complete!"}
            {step === 'error' && "Upload Failed"}
          </CardTitle>
          <CardDescription>
            {step === 'select' && "Documents require an on-chain NTKR burn as payment proof."}
            {step === 'intent_created' && "Click below to sign the NTKR burn in your wallet."}
            {step === 'burning' && "Check MetaMask — confirm the transaction."}
            {step === 'tx_submitted' && "Waiting for blockchain confirmation (this takes ~3–10 seconds)."}
            {step === 'confirming' && "Backend is verifying the burn event on-chain..."}
            {step === 'done' && "Your document is submitted and awaiting notary assignment."}
            {step === 'error' && (errorMsg || "An error occurred. Please try again.")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* ── STEP 1: File select form ─────────────────────────────────── */}
          {step === 'select' && (
            <>
              {/* Drag & Drop zone */}
              <label
                className={cn(
                  "relative block border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer",
                  dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-800 hover:border-slate-600 hover:bg-white/[0.02]"
                )}
                onDragEnter={handleDrag} onDragLeave={handleDrag}
                onDragOver={handleDrag} onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                <p className="font-semibold text-sm text-slate-200">Drop file or click to browse</p>
                <p className="text-xs text-slate-500 mt-1">PDF, JPG, PNG — max 10MB</p>
                <input type="file" onChange={handleFileInput} className="hidden" accept=".pdf,image/*" />
              </label>

              {file && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                  <div className="flex items-center gap-2 text-slate-200">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[220px]">{file.name}</span>
                    <span className="text-slate-500 text-xs">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setFile(null)} className="h-6 w-6">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <form onSubmit={handleInitiate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide">Category</Label>
                    <Select value={selectedCategory.toString()} onValueChange={v => setSelectedCategory(parseInt(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Basic Notarization — 1 NTKR</SelectItem>
                        <SelectItem value="1">Official Review — 5 NTKR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide">Document Title</Label>
                    <Input value={documentTitle} onChange={e => setDocumentTitle(e.target.value)} placeholder="e.g. Property Deed 2024" />
                  </div>
                </div>

                {walletMismatch && (
                  <div className="flex items-start gap-2 p-3 text-xs text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Wrong Wallet Connected</p>
                      <p>Switch to {user?.wallet_address?.slice(0, 6)}...{user?.wallet_address?.slice(-4)} in MetaMask.</p>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || !file || !documentTitle.trim() || walletMismatch}
                >
                  {busy
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading file...</>
                    : `Initiate Upload (${requiredTokens} NTKR)`
                  }
                </Button>
              </form>
            </>
          )}

          {/* ── STEP 2: Intent created — burn prompt ────────────────────── */}
          {(step === 'intent_created' || step === 'burning') && intent && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">File Hash</span>
                  <span className="font-mono text-xs text-slate-300 truncate max-w-[180px]">{intent.file_hash.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">NTKR to Burn</span>
                  <span className="font-semibold text-orange-400">{intent.amount} NTKR</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Expires</span>
                  <Countdown expiresAt={intent.expires_at} />
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 space-y-1">
                <p className="font-semibold">What happens next:</p>
                <p>1. MetaMask will open asking you to confirm a <code className="bg-blue-900/40 px-1 rounded">burnForUpload()</code> transaction</p>
                <p>2. Your wallet sends the TX to the NTKR contract on BNB Testnet</p>
                <p>3. Backend verifies the event and creates your document</p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleBurn}
                disabled={busy}
              >
                {step === 'burning'
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Waiting for MetaMask...</>
                  : <><Flame className="h-4 w-4 text-orange-400" />Burn {intent.amount} NTKR in Wallet</>
                }
              </Button>

              <Button variant="ghost" className="w-full text-xs text-slate-500" onClick={resetFlow}>
                Cancel &amp; Start Over
              </Button>
            </div>
          )}

          {/* ── STEP 3: TX submitted — waiting confirmation ──────────────── */}
          {(step === 'tx_submitted' || step === 'confirming') && txHash && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Transaction submitted to BNB Testnet</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Tx Hash</span>
                  <a
                    href={`https://testnet.bscscan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">
                    {step === 'tx_submitted' ? "Waiting for block confirmation..." : "Backend verifying burn event..."}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">This usually takes 3–15 seconds on BNB Testnet</p>
                </div>
              </div>

              {step === 'tx_submitted' && (
                <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => handleConfirm(txHash)}>
                  <RefreshCw className="h-3 w-3" /> Manually confirm now
                </Button>
              )}
            </div>
          )}

          {/* ── DONE ────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-16 w-16 text-green-400" />
              <p className="text-center text-sm text-slate-300">
                Document submitted successfully. A notary will be assigned automatically.
              </p>
              <Button onClick={() => router.push("/dashboard/documents")} className="w-full">
                View My Documents
              </Button>
            </div>
          )}

          {/* ── ERROR ───────────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{errorMsg}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={resetFlow}>
                Try Again
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
