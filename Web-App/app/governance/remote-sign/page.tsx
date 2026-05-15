"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, Wallet, ArrowRight, ArrowLeft, Gavel, Timer } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"

function RemoteSignContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
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
                const data = await apiClient.get(`/api/governance/remote/vote/status/${sessionId}`)

                if (data.status !== "pending") {
                    setStatus(data.status as any)
                    return
                }

                // Fetching the actual challenge and session info
                // The status endpoint should ideally return more info
                setSessionData(data)
                setStatus("ready")
            } catch (err: any) {
                setError(err.message)
                setStatus("error")
            }
        }

        fetchSession()
    }, [sessionId])

    const handleSignVote = async () => {
        if (typeof window === "undefined" || !(window as any).ethereum) {
            toast({
                title: "MetaMask Not Found",
                description: "Please install MetaMask to sign this vote.",
                variant: "destructive"
            })
            return
        }

        setStatus("signing")
        try {
            const { ethers } = await import("ethers")
            const provider = new ethers.BrowserProvider((window as any).ethereum)
            await provider.send("eth_requestAccounts", [])
            const signer = await provider.getSigner()
            const walletAddress = await signer.getAddress()
            setConnectedWallet(walletAddress)

            // 1. Fetch Latest Session Data
            const data = await apiClient.get(`/api/governance/remote/vote/status/${sessionId}`)
            
            // If the status endpoint above fails (because it's a SUBMIT session), try the SUBMIT endpoint
            let session = data;
            if (data.error || !data.type) {
                session = await apiClient.get(`/api/governance/remote/submit/status/${sessionId}`);
            }

            if (!session || !session.challenge) {
                throw new Error("Session challenge is missing. Please restart the process.")
            }

            // 2. Branch Logic based on Session Type
            if (session.type === 'SUBMIT') {
                console.log("🚀 [RemoteSign] Detected SUBMIT mode. Initiating Direct Blockchain Transaction.");
                
                if (!session.proposal || !session.multisigAddress) {
                    throw new Error("Proposal details missing from session data.");
                }

                const multisigAddress = session.multisigAddress;
                const { to, value, data: txData, proposalHash } = session.proposal;

                const contract = new ethers.Contract(multisigAddress, [
                    "function submitTransaction(address _to, uint256 _value, bytes _data, bytes32 _proposalHash) external"
                ], signer);

                toast({
                    title: "Transaction Initiated",
                    description: "Please confirm the transaction in MetaMask to submit the proposal.",
                });

                // Execute Transaction
                const tx = await contract.submitTransaction(to, value, txData, proposalHash);
                console.log("🚀 [RemoteSign] Transaction sent:", tx.hash);
                
                setStatus("authorized"); // Optimistic UI update or wait for confirm
                
                toast({
                    title: "Processing Transaction",
                    description: "Waiting for blockchain confirmation...",
                });

                const receipt = await tx.wait();
                console.log("🚀 [RemoteSign] Transaction confirmed:", receipt.hash);

                // 3. Sync with Backend
                try {
                    await apiClient.post("/api/governance/remote/submit/sync-manual", {
                        sessionId,
                        txHash: receipt.hash,
                        walletAddress
                    });
                } catch (err: any) {
                    console.error("Manual sync failed:", err);
                    // We don't throw here because the tx is already on-chain, 
                    // the desktop app can poll or the user can manual sync later.
                }

                setStatus("authorized")
                toast({
                    title: "Proposal Submitted",
                    description: "The proposal has been successfully recorded on-chain. Window closing in 10s."
                })

            } else {
                // Standard VOTE logic (Signature-based)
                console.log("🚀 [RemoteSign] Detected VOTE mode. Using Cryptographic Signing.");
                const signature = await signer.signMessage(session.challenge)

                await apiClient.post("/api/governance/remote/vote/authorize", {
                    sessionId,
                    walletAddress,
                    signature
                })

                setStatus("authorized")
                toast({
                    title: "Vote Signed Successfully",
                    description: "Your vote has been recorded. This window will close automatically."
                })
            }

            // Auto-close after 10 seconds
            setTimeout(() => {
                if (typeof window !== 'undefined') {
                    window.close();
                }
            }, 10000);
        } catch (err: any) {
            console.error(err)
            setError(err.message || "Action failed")
            setStatus("error")
            toast({
                title: "Operation Failed",
                description: err.message || "An unexpected error occurred.",
                variant: "destructive"
            })
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl border-emerald-500/20 bg-slate-900 text-slate-100">
                <CardHeader className="text-center border-b border-slate-800 pb-6">
                    <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
                        <Gavel className="w-8 h-8 text-emerald-400" />
                    </div>
                    <CardTitle className="text-2xl text-emerald-400 font-bold tracking-tight">Governance Signing</CardTitle>
                    <CardDescription className="text-slate-400">
                        Authorize an immutable governance decision through your secure wallet.
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
                                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                                <p className="text-sm text-slate-400">Syncing with Desktop session...</p>
                            </motion.div>
                        )}

                        {status === "ready" && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-3">
                                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Decision Summary</h4>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-400">Action:</span>
                                        <span className="text-sm font-medium text-white px-2 py-0.5 bg-slate-800 rounded">
                                            {sessionData?.type === 'SUBMIT' ? 'Governance Proposal' : 'Governance Vote'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-relaxed italic">
                                        {sessionData?.type === 'SUBMIT' 
                                            ? '"I hereby authorize the creation of this governance proposal and its submission to the blockchain via my connected wallet."'
                                            : '"I hereby confirm my decision on this proposal and authorize the recording of my wallet signature and timestamp on the blockchain."'
                                        }
                                    </p>
                                </div>

                                {connectedWallet && (
                                    <div className="p-3 bg-slate-800/50 rounded-lg flex items-center justify-between border border-slate-700">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-emerald-400" />
                                            <span className="text-xs font-mono text-slate-300">
                                                {connectedWallet.substring(0, 6)}...{connectedWallet.substring(38)}
                                            </span>
                                        </div>
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full uppercase font-bold">Connected</span>
                                    </div>
                                )}

                                <Button onClick={handleSignVote} className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-lg rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95">
                                    <ShieldCheck className="w-5 h-5 mr-2" /> 
                                    {sessionData?.type === 'SUBMIT' ? 'Submit to Blockchain' : 'Complete Secure Audit'}
                                </Button>
                            </motion.div>
                        )}

                        {status === "signing" && (
                            <motion.div
                                key="signing"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex flex-col items-center py-10 space-y-4"
                            >
                                <div className="w-14 h-14 border-4 border-emerald-500/10 border-t-emerald-400 rounded-full animate-spin" />
                                <p className="font-bold text-emerald-400 animate-pulse text-lg">Check Wallet Extension</p>
                                <p className="text-sm text-slate-400">Sign the audit challenge to commit your vote.</p>
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
                                    <h3 className="text-2xl font-bold text-white">Entry Recorded</h3>
                                    <p className="text-sm text-slate-400 max-w-[200px] mx-auto">
                                        Your signature has been cryptographically attached. This tab will close in 10 seconds.
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2 text-[10px] text-emerald-500/40 uppercase tracking-widest font-bold">
                                    <Timer className="w-3 h-3 animate-pulse" />
                                    <span>Closing Automatically</span>
                                </div>
                                <Button variant="ghost" onClick={() => window.close()} className="text-slate-500 hover:text-slate-400 hover:bg-slate-500/5 text-[10px] uppercase font-bold tracking-widest">
                                    Close Now
                                </Button>
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
                                    <AlertTitle className="font-bold">Protocol Error</AlertTitle>
                                    <AlertDescription className="text-xs">{error}</AlertDescription>
                                </Alert>
                                <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => router.push("/dashboard")}>
                                    Return to Control Center
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
                <CardFooter className="justify-center border-t border-slate-800 py-4">
                    <p className="text-[10px] text-slate-600 font-mono tracking-tighter opacity-50 uppercase">
                        Secure Audit Handshake • {sessionId?.toString().substring(0, 8)}
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
}

export default function RemoteSignPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" /></div>}>
            <RemoteSignContent />
        </Suspense>
    )
}
