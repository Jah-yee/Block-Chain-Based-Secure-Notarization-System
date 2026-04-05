"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, Wallet, AlertCircle, CheckCircle2, Key, Loader2, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"

import { apiClient } from "@/lib/api-client"

function RemoteConfirmContent() {
    const searchParams = useSearchParams()
    const { toast } = useToast()

    const sessionId = searchParams.get("sessionId")
    const [status, setStatus] = useState<"loading" | "ready" | "signing" | "authorized" | "expired" | "error">("loading")
    const [error, setError] = useState<string | null>(null)
    const [sessionData, setSessionData] = useState<any>(null)
    const [connectedWallet, setConnectedWallet] = useState<string | null>(null)

    useEffect(() => {
        const checkWallet = async () => {
            if (typeof window !== "undefined" && (window as any).ethereum) {
                try {
                    const { ethers } = await import("ethers")
                    const provider = new ethers.BrowserProvider((window as any).ethereum)
                    const accounts = await provider.listAccounts()
                    if (accounts.length > 0) {
                        setConnectedWallet(accounts[0].address)
                    }
                } catch (e) { }
            }
        }
        checkWallet()
    }, [])

    useEffect(() => {
        if (!sessionId) {
            setError("Missing Session ID.")
            setStatus("error")
            return
        }

        const fetchSession = async () => {
            try {
                const data = await apiClient.get(`/api/governance/remote/confirm/status/${sessionId}`)

                if (data.status !== "pending") {
                    setStatus(data.status as any)
                    return
                }

                setSessionData(data)
                setStatus("ready")
            } catch (err: any) {
                setError(err.message)
                setStatus("error")
            }
        }

        fetchSession()
    }, [sessionId])

    const handleSignConfirm = async () => {
        if (typeof window === "undefined" || !(window as any).ethereum) {
            toast({
                title: "MetaMask Not Found",
                description: "Please install MetaMask to sign this transaction.",
                variant: "destructive"
            })
            return
        }

        setStatus("signing")
        try {
            const { ethers } = await import("ethers")
            const provider = new ethers.BrowserProvider((window as any).ethereum)
            const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
            const signer = await provider.getSigner()
            const walletAddress = accounts[0] // Use accounts[0] directly
            setConnectedWallet(walletAddress)

            if (!sessionData?.challenge) {
                throw new Error("Challenge missing from session. Refresh and try again.")
            }

            // Sign the challenge
            const signature = await signer.signMessage(sessionData.challenge)

            // Submit to MultiSig Authorize Endpoint using apiClient
            const result = await apiClient.post("/api/governance/remote/confirm/authorize", {
                sessionId,
                walletAddress,
                signature
            })

            setStatus("authorized")
            toast({
                title: result.executed ? "Executed On-Chain!" : "Confirmation Signed",
                description: result.message,
                variant: result.executed ? "default" : "default"
            })

            // Auto-close after 5 seconds
            setTimeout(() => {
                if (typeof window !== 'undefined') {
                    window.close();
                }
            }, 5000);
        } catch (err: any) {
            console.error(err)
            setError(err.message || "Failed to sign transaction")
            setStatus("error")
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl border-emerald-500/20 bg-slate-900 text-slate-100">
                <CardHeader className="text-center border-b border-slate-800 pb-6">
                    <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 border border-blue-500/20">
                        <Key className="w-8 h-8 text-blue-400" />
                    </div>
                    <CardTitle className="text-2xl text-blue-400 font-bold tracking-tight">Multi-Sig Confirmation</CardTitle>
                    <CardDescription className="text-slate-400">
                        Authorize a high-security transaction confirmation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-8 space-y-6">
                    <AnimatePresence mode="wait">
                        {status === "loading" && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex flex-col items-center py-8 space-y-4"
                            >
                                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                                <p className="text-sm text-slate-400">Verifying session...</p>
                            </motion.div>
                        )}

                        {status === "ready" && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-3">
                                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Confirmation Request</h4>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-400">Type:</span>
                                        <span className="text-sm font-medium text-white px-2 py-0.5 bg-slate-800 rounded">On-Chain Sign</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-mono mt-2 bg-black/20 p-2 rounded border border-white/5">
                                        {sessionData?.challenge}
                                    </p>
                                </div>

                                {connectedWallet && (
                                    <div className="p-3 bg-slate-800/50 rounded-lg flex items-center justify-between border border-slate-700">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-blue-400" />
                                            <span className="text-xs font-mono text-slate-300">
                                                {connectedWallet.substring(0, 6)}...{connectedWallet.substring(38)}
                                            </span>
                                        </div>
                                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full uppercase font-bold">Connected</span>
                                    </div>
                                )}

                                <Button onClick={handleSignConfirm} className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                                    <ShieldCheck className="w-5 h-5 mr-2" /> Confirm Transaction
                                </Button>
                            </motion.div>
                        )}

                        {status === "signing" && (
                            <motion.div
                                key="signing"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex flex-col items-center py-10 space-y-4"
                            >
                                <div className="w-14 h-14 border-4 border-blue-500/10 border-t-blue-400 rounded-full animate-spin" />
                                <p className="font-bold text-blue-400 animate-pulse text-lg">Check Wallet Extension</p>
                                <p className="text-sm text-slate-400">Sign the challenge to verify identity.</p>
                            </motion.div>
                        )}

                        {status === "authorized" && (
                            <motion.div
                                key="authorized"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center py-8 space-y-6 text-center"
                            >
                                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/30">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-white">Confirmed!</h3>
                                    <p className="text-sm text-slate-400 max-w-[200px] mx-auto">
                                        Transaction has been confirmed and/or executed on-chain.
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2 text-[10px] text-emerald-500/40 uppercase tracking-widest font-bold">
                                    <Timer className="w-3 h-3 animate-pulse" />
                                    <span>Closing Automatically</span>
                                </div>
                            </motion.div>
                        )}

                        {status === "error" && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="space-y-4 py-4"
                            >
                                <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/30 text-rose-400">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className="font-bold">Error</AlertTitle>
                                    <AlertDescription className="text-xs">{error}</AlertDescription>
                                </Alert>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </div>
    )
}

export default function RemoteConfirmPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}>
            <RemoteConfirmContent />
        </Suspense>
    )
}
