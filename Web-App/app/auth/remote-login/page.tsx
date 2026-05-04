"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, Wallet, AlertCircle, CheckCircle2, Lock, Timer, ShieldX, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api-client"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || ""

interface UserProfile {
    id: string
    name: string
    email: string
    wallet_address: string
    role: string
}

type PageStatus =
    | "checking_auth"      // 1. verifying web session
    | "not_authenticated"  // 2. not logged in → will redirect to /login
    | "wrong_role"         // 3. logged in but not admin
    | "loading_session"    // 4. fetching the remote session challenge
    | "ready"              // 5. show the authorize button
    | "signing"            // 6. waiting for MetaMask signature
    | "authorized"         // 7. done
    | "expired"            // 8. session timed out
    | "error"              // 9. anything else

function RemoteLoginContent() {
    const searchParams = useSearchParams()
    const { toast } = useToast()

    const sessionId = searchParams.get("sessionId")
    const [status, setStatus] = useState<PageStatus>("checking_auth")
    const [error, setError] = useState<string | null>(null)
    const [challenge, setChallenge] = useState<string | null>(null)
    const [user, setUser] = useState<UserProfile | null>(null)

    // ─────────────────────────────────────────────
    // STEP 1: Check if the user is logged in to the web app
    // ─────────────────────────────────────────────
    useEffect(() => {
        if (!sessionId) {
            setError("Missing Session ID. Please restart the login process from the desktop app.")
            setStatus("error")
            return
        }

        const checkAuth = async () => {
            try {
                const data = await apiClient.get("/auth/me")
                const profile = data.user; // Extract nested user object

                // Got a valid profile — check role
                if (profile.role !== "admin") {
                    setUser(profile)
                    setStatus("wrong_role")
                    return
                }
                setUser(profile)
                // Now fetch the remote session challenge
                setStatus("loading_session")
            } catch (err: any) {
                // Not logged in is OK for remote auth — we'll just be a "guest" signer
                console.log("No web session found, proceeding as guest signer")
                setStatus("loading_session")
            }
        }

        checkAuth()
    }, [sessionId])

    // STEP 2: (Redirect removed to allow direct remote signing)

    // ─────────────────────────────────────────────
    // STEP 3: Load the session challenge once auth is confirmed
    // ─────────────────────────────────────────────
    useEffect(() => {
        if (status !== "loading_session" || !sessionId) return

        const fetchChallenge = async () => {
            try {
                const data = await apiClient.get(`/api/auth/remote/status/${sessionId}`)

                if (data.status === "expired") { setStatus("expired"); return }
                if (data.status === "authorized") { setStatus("authorized"); return }
                if (data.status !== "pending") {
                    setError(`Unexpected session state: ${data.status}`)
                    setStatus("error")
                    return
                }
                if (!data.challenge) {
                    setError("Session challenge is missing. Please restart the login process.")
                    setStatus("error")
                    return
                }

                setChallenge(data.challenge)
                setStatus("ready")
            } catch (err: any) {
                setError(err.message || "Failed to load session")
                setStatus("error")
            }
        }

        fetchChallenge()
    }, [status, sessionId])

    // ─────────────────────────────────────────────
    // STEP 4: Authorize — sign challenge, call backend
    // ─────────────────────────────────────────────
    const handleAuthorize = async () => {
        if (!sessionId || !challenge) return

        console.log("🚀 [RemoteAuth] Step 1: Initiating Authorization...")
        setStatus("signing")
        
        try {
            // 🛡️ [SECURITY] Hardened Wallet Re-Connection Insurance
            if (typeof window === "undefined" || !(window as any).ethereum) throw new Error("MetaMask not found.")
            
            const { ethers } = await import("ethers")
            const provider = new ethers.BrowserProvider((window as any).ethereum)
            console.log("🚀 [RemoteAuth] Step 2: Requesting Accounts...")
            await provider.send("eth_requestAccounts", [])
            
            const signer = await provider.getSigner()
            const connectedAddress = await signer.getAddress()
            console.log(`🚀 [RemoteAuth] Step 3: Connected to ${connectedAddress}`)

            console.log("🚀 [RemoteAuth] Step 4: Signing Challenge...")
            const signature = await signer.signMessage(challenge)
            console.log("🚀 [RemoteAuth] Step 5: Signature obtained. Sending to server...")

            const API_BASE = "https://api.bbsns.online"
            const authResponse = await fetch(`${API_BASE}/api/auth/remote/authorize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    walletAddress: connectedAddress,
                    signature
                })
            })

            if (!authResponse.ok) {
                const errorData = await authResponse.json()
                throw new Error(errorData.error || "Authorization failed on server")
            }

            console.log("🚀 [RemoteAuth] Step 6: Authorization SUCCESS!")
            toast({
                title: "Desktop Session Authorized",
                description: "Your desktop app is now logged in. This window will close in 10 seconds."
            })
            setStatus("authorized")
            setTimeout(() => { if (typeof window !== "undefined") window.close() }, 10000)
        } catch (err: any) {
            console.error("[RemoteLogin] Authorize error:", err)
            setError(err.message || "Authorization failed. Please try again.")
            setStatus("ready") // go back to ready so they can retry
            toast({ title: "Authorization Failed", description: err.message, variant: "destructive" })
        }
    }

    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl border-emerald-500/20 bg-slate-900 text-slate-100">
                <CardHeader className="text-center border-b border-slate-800 pb-6">
                    <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
                        <Lock className="w-8 h-8 text-emerald-400" />
                    </div>
                    <CardTitle className="text-2xl text-emerald-400 font-bold tracking-tight">Admin Desktop Login</CardTitle>
                    <CardDescription className="text-slate-400">
                        Authorize your desktop session via the secure web handshake.
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-8 space-y-6 min-h-[200px]">
                    <AnimatePresence mode="wait">

                        {/* Checking auth / loading */}
                        {(status === "checking_auth" || status === "loading_session") && (
                            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex flex-col items-center py-8 space-y-4"
                            >
                                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                                <p className="text-sm text-slate-400">
                                    {status === "checking_auth" ? "Verifying your session..." : "Loading desktop session..."}
                                </p>
                            </motion.div>
                        )}

                        {/* Not authenticated — redirect notice */}
                        {status === "not_authenticated" && (
                            <motion.div key="redirecting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center py-8 space-y-4 text-center"
                            >
                                <div className="w-14 h-14 border-4 border-blue-500/10 border-t-blue-400 rounded-full animate-spin" />
                                <div>
                                    <p className="font-bold text-blue-300 text-lg">Login Required</p>
                                    <p className="text-sm text-slate-400 mt-1">Redirecting you to sign in…</p>
                                </div>
                            </motion.div>
                        )}

                        {/* Wrong role */}
                        {status === "wrong_role" && (
                            <motion.div key="wrong_role" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="space-y-4 py-4"
                            >
                                <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-400">
                                    <ShieldX className="h-4 w-4" />
                                    <AlertTitle className="font-bold">Access Denied</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        Desktop login requires an <strong>admin</strong> account. You are logged in as <strong>{user?.role}</strong>.
                                        <br />Please log out and sign in with your admin credentials.
                                    </AlertDescription>
                                </Alert>
                                <Button
                                    variant="outline"
                                    className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                                    onClick={() => {
                                        const callbackUrl = encodeURIComponent(`/auth/remote-login?sessionId=${sessionId}`)
                                        window.location.href = `/login?callbackUrl=${callbackUrl}`
                                    }}
                                >
                                    <LogIn className="w-4 h-4 mr-2" /> Sign in with Admin Account
                                </Button>
                            </motion.div>
                        )}

                        {/* Ready to authorize */}
                        {status === "ready" && (
                            <motion.div key="ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="space-y-5"
                            >
                                {user ? (
                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-3">
                                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Authenticated As</h4>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-slate-400">Name</span>
                                                <span className="text-xs font-medium text-white">{user.name || user.email}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-slate-400">Role</span>
                                                <span className="text-xs font-bold uppercase px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">{user.role}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-slate-400">Wallet</span>
                                                <span className="text-xs font-mono text-slate-300">
                                                    {user.wallet_address.substring(0, 8)}...{user.wallet_address.substring(36)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-3">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Guest Authorization</h4>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                            No active web session. Your desktop app will be authorized using the wallet you sign with in MetaMask.
                                        </p>
                                    </div>
                                )}

                                {/* Session info */}
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs text-slate-500">Session</span>
                                    <span className="text-xs font-mono text-slate-500">{sessionId?.substring(0, 8)}…</span>
                                </div>

                                {/* Error display (retry case) */}
                                {error && (
                                    <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/30 text-rose-400">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">{error}</AlertDescription>
                                    </Alert>
                                )}

                                <Button
                                    onClick={handleAuthorize}
                                    className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-lg rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                >
                                    <ShieldCheck className="w-5 h-5 mr-2" /> Authorize Desktop Login
                                </Button>

                                <p className="text-center text-[10px] text-slate-600 leading-relaxed">
                                    MetaMask will ask you to sign a challenge. This grants your desktop app a 12-hour session.
                                </p>
                            </motion.div>
                        )}

                        {/* Signing */}
                        {status === "signing" && (
                            <motion.div key="signing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex flex-col items-center py-10 space-y-4"
                            >
                                <div className="w-14 h-14 border-4 border-emerald-500/10 border-t-emerald-400 rounded-full animate-spin" />
                                <p className="font-bold text-emerald-400 animate-pulse text-lg">Check MetaMask</p>
                                <p className="text-sm text-slate-400">Sign the challenge to authorize your desktop session.</p>
                            </motion.div>
                        )}

                        {/* Authorized */}
                        {status === "authorized" && (
                            <motion.div key="authorized" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center py-8 space-y-6 text-center"
                            >
                                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/30">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-white">Desktop Authorized</h3>
                                    <p className="text-sm text-slate-400 max-w-[220px] mx-auto">
                                        Your desktop app is now logged in. This window will close in 10 seconds.
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2 text-[10px] text-emerald-500/40 uppercase tracking-widest font-bold">
                                    <Timer className="w-3 h-3 animate-pulse" />
                                    <span>Closing Automatically</span>
                                </div>
                                <Button variant="ghost" onClick={() => window.close()}
                                    className="text-slate-500 hover:text-slate-400 hover:bg-slate-500/5 text-[10px] uppercase font-bold tracking-widest"
                                >
                                    Close Now
                                </Button>
                            </motion.div>
                        )}

                        {/* Expired */}
                        {status === "expired" && (
                            <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="space-y-4 py-4"
                            >
                                <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-400">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className="font-bold">Session Expired</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        This login session has expired. Please close this window and click &ldquo;Login via Browser&rdquo; again in the desktop app.
                                    </AlertDescription>
                                </Alert>
                            </motion.div>
                        )}

                        {/* Generic error */}
                        {status === "error" && (
                            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="space-y-4 py-4"
                            >
                                <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/30 text-rose-400">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle className="font-bold">Error</AlertTitle>
                                    <AlertDescription className="text-xs">{error}</AlertDescription>
                                </Alert>
                                <p className="text-center text-xs text-slate-500">
                                    Close this window and click &ldquo;Login via Browser&rdquo; again in the desktop app.
                                </p>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </CardContent>

                <CardFooter className="justify-center border-t border-slate-800 py-4">
                    <p className="text-[10px] text-slate-600 font-mono tracking-tighter opacity-50 uppercase">
                        BBSNS Secure Handshake • {sessionId?.substring(0, 8) ?? "—"}
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
}

export default function RemoteLoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            </div>
        }>
            <RemoteLoginContent />
        </Suspense>
    )
}
