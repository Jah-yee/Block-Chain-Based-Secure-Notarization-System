"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Shield, Lock, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/lib/api-client"
import { ethers } from "ethers"

function ActivationForm() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { toast } = useToast()
    
    const token = searchParams.get("token")
    
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [appInfo, setAppInfo] = useState<{ wallet: string; email: string; name: string } | null>(null)
    const [step, setStep] = useState<'LOADING' | 'VERIFY_WALLET' | 'SET_PASSWORD' | 'SUCCESS'>('LOADING')
    const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
    const [signature, setSignature] = useState<string | null>(null)
    const [nonce, setNonce] = useState<string | null>(null)

    useEffect(() => {
        if (!token) {
            setError("Missing activation token. Please check your email link.")
            setStep('VERIFY_WALLET')
            return
        }

        const fetchInfo = async () => {
            try {
                const info = await apiClient.get(`/auth/activation-info?token=${token}`)
                setAppInfo(info)
                setStep('VERIFY_WALLET')
            } catch (err: any) {
                setError(err.message || "Invalid or expired activation token.")
            }
        }
        fetchInfo()
    }, [token])

    const connectWallet = async () => {
        if (!window.ethereum) {
            toast({ title: "MetaMask Required", description: "Please install MetaMask to proceed.", variant: "destructive" })
            return
        }
        setIsLoading(true)
        try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
            setConnectedWallet(accounts[0]?.toLowerCase())
            toast({ title: "Wallet Connected", description: "MetaMask identity detected." })
        } catch (err: any) {
            toast({ title: "Connection Failed", description: err.message, variant: "destructive" })
        } finally {
            setIsLoading(false)
        }
    }

    const handleSignAndFinalize = async () => {
        if (!token || !appInfo || !connectedWallet) return

        if (connectedWallet.toLowerCase() !== appInfo.wallet.toLowerCase()) {
            toast({ 
                title: "Wrong Wallet", 
                description: `Please switch MetaMask to: ${appInfo.wallet.substring(0, 8)}...`, 
                variant: "destructive" 
            })
            return
        }

        if (password.length < 8) {
            toast({ title: "Weak Password", description: "Password must be at least 8 characters long.", variant: "destructive" })
            return
        }

        if (password !== confirmPassword) {
            toast({ title: "Mismatch", description: "Passwords do not match.", variant: "destructive" })
            return
        }

        setIsLoading(true)
        try {
            // 1. Fetch Nonce
            const nonceData = await apiClient.post("/auth/nonce", {
                wallet_address: connectedWallet,
                purpose: 'NOTARY_ACTIVATE'
            });
            const { nonce: receivedNonce, message_template } = nonceData;

            // 2. Sign custom message
            if (!window.ethereum) throw new Error("Ethereum provider not found");
            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const signer = await provider.getSigner();
            const sig = await signer.signMessage(message_template);

            // 3. Finalize Activation
            await apiClient.post("/auth/activate", {
                token,
                password,
                signature: sig,
                nonce: receivedNonce
            })
            
            setIsSuccess(true)
            setStep('SUCCESS')
            toast({ title: "Account Activated", description: "Your notary profile is now live." })
        } catch (err: any) {
            toast({ title: "Activation Failed", description: err.message, variant: "destructive" })
        } finally {
            setIsLoading(false)
        }
    }

    if (step === 'SUCCESS') {
        return (
            <Card className="border-green-500/20 bg-green-500/5 backdrop-blur-sm">
                <CardContent className="pt-10 pb-10 text-center space-y-6">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 shadow-lg shadow-green-500/10">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-foreground">Activation Successful</h2>
                        <p className="text-muted-foreground">
                            Your secure notary identity has been provisioned on the BBSNS network.
                        </p>
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg border text-sm text-left space-y-2">
                        <p className="font-semibold flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" /> 
                            Next Steps:
                        </p>
                        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                            <li>Download the BBSNS Desktop Application.</li>
                            <li>Sign in using your email and the password you just set.</li>
                            <li>Keep your physical ID and Wallet ready.</li>
                        </ol>
                    </div>

                    <Button onClick={() => window.location.href = "/"} className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90">
                        Return to Home
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-primary/10 bg-background/50 backdrop-blur-md shadow-2xl">
            <CardHeader className="text-center space-y-2">
                <div className="flex justify-center mb-2">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <Lock className="h-6 w-6 text-primary" />
                    </div>
                </div>
                <CardTitle className="text-2xl font-bold">Secure Activation</CardTitle>
                <CardDescription>
                    Prove ownership of your professional wallet to finalize registration.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error ? (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold">Requirement Failed</p>
                            <p className="text-xs opacity-80">{error}</p>
                            <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="mt-2 h-7 text-xs px-2 -ml-2 text-destructive hover:bg-destructive/10">
                                Contact Support
                            </Button>
                        </div>
                    </div>
                ) : step === 'LOADING' ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* 🛡️ Wallet Info Section */}
                        <div className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <span>Assigned Wallet</span>
                                {connectedWallet && connectedWallet.toLowerCase() === appInfo?.wallet.toLowerCase() ? (
                                    <span className="text-green-500">Correct Wallet Linked</span>
                                ) : (
                                    <span className="text-yellow-500">Connection Pending</span>
                                )}
                            </div>
                            <div className="font-mono text-xs bg-black/40 p-3 rounded-xl border border-white/5 break-all">
                                {appInfo?.wallet || "Loading identity..."}
                            </div>
                            {!connectedWallet ? (
                                <Button onClick={connectWallet} className="w-full h-10 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 text-xs font-bold">
                                    Connect Authorized Wallet
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2 text-[10px] text-green-500 font-bold px-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    MetaMask Connected ({connectedWallet.substring(0, 6)}...{connectedWallet.substring(38)})
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">Professional Password</Label>
                                <Input id="password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} className="h-11 bg-muted/30" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input id="confirmPassword" type="password" placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} className="h-11 bg-muted/30" required />
                            </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground bg-muted/20 p-3 rounded border italic">
                            By proceeding, you cryptographically bind your identity to this BBSNS node. This cannot be undone.
                        </div>

                        <Button onClick={handleSignAndFinalize} className="w-full h-14 rounded-xl font-bold transition-all bg-primary hover:bg-primary/90" disabled={isLoading || !connectedWallet}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Executing Secure Handover...
                                </>
                            ) : (
                                <>
                                    Verify & Activate Account
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function ActivatePage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4 relative overflow-hidden">
            {/* Background Aesthetics */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.05),transparent_70%)]" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
            
            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-widest mb-4">
                        <Shield className="h-3 w-3" />
                        BBSNS Protocol
                    </div>
                </div>

                <Suspense fallback={
                    <Card className="border-primary/10 bg-background/50 backdrop-blur-md animate-pulse">
                        <CardHeader className="h-32" />
                        <CardContent className="h-64" />
                    </Card>
                }>
                    <ActivationForm />
                </Suspense>

                <p className="text-center mt-8 text-[10px] text-muted-foreground uppercase tracking-widest">
                    Authorized Notary Onboarding • v4.0 Secure Node
                </p>
            </div>
        </div>
    )
}
