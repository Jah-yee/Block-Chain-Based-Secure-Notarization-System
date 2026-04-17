"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    FileText, Camera, Wallet, ArrowRight, ArrowLeft, 
    CheckCircle2, Shield, Lock, Globe, Contact, Check 
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import apiClient from "@/lib/api-client"
import { ethers } from "ethers"
import { cn } from "@/lib/utils"

const LivenessCheck = dynamic(
  () => import("@/components/auth/liveness-check").then((mod) => mod.LivenessCheck),
  { ssr: false }
)

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command"

const countries = [
    { name: "Afghanistan", code: "AF", dial_code: "+93", flag: "🇦🇫" },
    { name: "Albania", code: "AL", dial_code: "+355", flag: "🇦🇱" },
    { name: "Algeria", code: "DZ", dial_code: "+213", flag: "🇩🇿" },
    { name: "India", code: "IN", dial_code: "+91", flag: "🇮🇳" },
    { name: "United Kingdom", code: "GB", dial_code: "+44", flag: "🇬🇧" },
    { name: "United States", code: "US", dial_code: "+1", flag: "🇺🇸" },
    // Simplified for demo
]

export default function RegisterNotaryPage() {
    const { toast } = useToast()
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [isLoading, setIsLoading] = useState(false)
    const [applicationId, setApplicationId] = useState<number | null>(null)
    const [referenceId, setReferenceId] = useState<string | null>(null)
    
    // Form State
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        nationalId: "",
        license: "",
        phone: "",
        experience: ""
    })
    
    // 🛡️ [Hardening] Domain Validation Gaps
    const REGEX = {
        NAME: /^[A-Za-z]+([ .'-][A-Za-z]+)*$/,
        EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        PHONE: /^[0-9]{10}$/,
        ALPHA_NUMERIC: /^[A-Za-z0-9]{6,20}$/
    };

    const validationErrors = {
        name: formData.name && (!REGEX.NAME.test(formData.name) || formData.name.split(/\s+/).length > 4 || formData.name.split(/\s+/).length < 2),
        email: formData.email && !REGEX.EMAIL.test(formData.email),
        phone: formData.phone && !REGEX.PHONE.test(formData.phone),
        nationalId: formData.nationalId && (!REGEX.ALPHA_NUMERIC.test(formData.nationalId) || formData.nationalId.length < 6),
        license: formData.license && (!REGEX.ALPHA_NUMERIC.test(formData.license) || formData.license.length < 6)
    };

    const isPhase1Valid = !validationErrors.name && !validationErrors.email && !validationErrors.phone && 
                         !validationErrors.nationalId && !validationErrors.license &&
                         formData.name && formData.email && formData.phone && formData.nationalId && formData.license;

    const [selectedNationality, setSelectedNationality] = useState(countries[3])
    const [openNationality, setOpenNationality] = useState(false)

    // Verification State
    const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
    const [isLivenessDone, setIsLivenessDone] = useState(false)
    const [isWalletSigned, setIsWalletSigned] = useState(false)
    const [signature, setSignature] = useState<string | null>(null)

    // 🛡️ [Hardening] Local Persistence Configuration
    const DRAFT_KEY = "bbsns_notary_draft";
    const EXPIRY_MS = 24 * 60 * 60 * 1000; 

    useEffect(() => {
        const checkExistingApplication = async () => {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            const resumingId = localStorage.getItem("bbsns_resuming_id");
            
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    const now = Date.now();
                    if (now - (parsed.timestamp || 0) < EXPIRY_MS) {
                        setFormData(prev => ({ ...prev, ...parsed.formData }));
                        setStep(1); 
                        console.log("[GUARD] Local draft restored. Resetting to Phase 1.");
                        
                        const isDraftValid = REGEX.NAME.test(parsed.formData.name || "") && REGEX.EMAIL.test(parsed.formData.email || "");
                        if (!isDraftValid) {
                            toast({ title: "Draft Found", description: "Some fields in your saved draft need correction.", variant: "default" });
                        } else {
                            toast({ title: "Draft Restored", description: "Returning to your previous registration state." });
                        }
                    } else {
                        localStorage.removeItem(DRAFT_KEY);
                    }
                } catch (e) {
                    console.error("[GUARD] Draft restore failed:", e);
                }
            }

            if (!resumingId || resumingId === "undefined" || resumingId === "null") return;

            try {
                const response = await apiClient.get(`/api/notaries/applications/status/${resumingId}`);
                const statusData = response.data; // apiClient correctly returns { status, data, error }
                
                if (statusData && statusData.id) setApplicationId(statusData.id);
                if (statusData && statusData.reference_id) setReferenceId(statusData.reference_id);
                
                const TERMINAL_STATES = ['APPLIED', 'KYC_VERIFIED', 'approved', 'activated', 'submitted'];
                if (statusData && TERMINAL_STATES.includes(statusData.status)) {
                    toast({ 
                        title: "Application Locked", 
                        description: "Our records show an active or pending application for this identity. Redirecting to Home in 6 seconds...",
                        variant: "destructive"
                    });
                    localStorage.removeItem(DRAFT_KEY);
                    localStorage.removeItem("bbsns_resuming_id");
                    setTimeout(() => router.push("/"), 6000);
                } else if (statusData.status === 'pending') {
                    setStep(2);
                }
            } catch (e: any) {
                console.error("[GUARD] Status check failed:", e);
                if (e.status === 404 || e.status === 400) {
                    localStorage.removeItem("bbsns_resuming_id");
                    localStorage.removeItem(DRAFT_KEY);
                    setStep(1);
                }
            }
        };

        checkExistingApplication();
    }, [router, toast]);

    useEffect(() => {
        if (step === 1 || step === 2 || step === 3) {
            const timer = setTimeout(() => {
                const draft = {
                    formData,
                    step,
                    timestamp: Date.now()
                };
                localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [formData, step]);

    const handleInputChange = (field: string, value: string) => {
        let sanitized = value;
        if (field === "name") sanitized = value.replace(/[^A-Za-z\s.'-]/g, "");
        if (field === "phone") sanitized = value.replace(/[^0-9]/g, "").slice(0, 10);
        if (field === "nationalId" || field === "license") sanitized = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        setFormData(prev => ({ ...prev, [field]: sanitized }));
    };

    const handleSubmitPhase1 = async () => {
        setIsLoading(true);
        try {
            const envelope = await apiClient.post("/api/notaries/applications/public", {
                fullName: formData.name,
                email: formData.email,
                phone: formData.phone,
                license: formData.license,
                experience: formData.experience ? parseInt(formData.experience) : null,
                nationalId: formData.nationalId,
                nationality: selectedNationality.name
            });
            
            const application = envelope.data;

            // CASE 1: Resume an existing session (Draft Restore)
            if (application && application.resumed) {
                setApplicationId(application.id);
                setReferenceId(application.reference_id);
                localStorage.setItem("bbsns_resuming_id", application.id.toString());
                toast({ 
                    title: "Draft Restored", 
                    description: "We found your existing application. Resuming from where you left off.",
                    variant: "default" 
                });
                setStep(2);
                return;
            }

            // CASE 2: Identity already fully registered or in advanced review
            if (application && (application.status === 'verified' || application.status === 'approved' || application.status === 'activated')) {
                toast({ 
                    title: "Registration In Progress", 
                    description: "This identity is already being processed or is active in our system. Redirecting to home...",
                    variant: "destructive",
                    duration: 6000
                });
                setTimeout(() => router.push("/"), 6000);
                return;
            }

            if (!application || !application.id) throw new Error("Our system failed to initialize your registration profile.");

            setApplicationId(application.id);
            setReferenceId(application.reference_id);
            localStorage.setItem("bbsns_resuming_id", application.id.toString());
            toast({ title: "Profile Recorded", description: "Phase 1 complete. Let's proceed to biometric verification." });
            setStep(2);
        } catch (e: any) {
            const errorMsg = e.response?.data?.error || e.message || "Connection Interrupted";
            
            if (errorMsg.toLowerCase().includes("already registered") || errorMsg.toLowerCase().includes("exists")) {
                toast({ 
                    title: "Application Pending", 
                    description: "An application for this identity is already in our queue. Please wait for the official review. Redirecting...", 
                    variant: "destructive",
                    duration: 6000
                });
                setTimeout(() => router.push("/"), 6000);
            } else {
                toast({ 
                    title: "Submission Issue", 
                    description: errorMsg.includes("403") ? "Your session security policy needs re-validation. Please refresh." : errorMsg, 
                    variant: "destructive" 
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignWallet = async () => {
        if (!applicationId || !window.ethereum) return;
        setIsLoading(true);
        try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
            const wallet = accounts[0];
            if (!wallet) throw new Error("No wallet selected");
            localStorage.setItem("connectedWallet", wallet);

            const nonceResponse = await apiClient.post("/api/auth/nonce", {
                wallet_address: wallet,
                purpose: 'NOTARY_BIND'
            });
            const { message_template, nonce: receivedNonce } = nonceResponse;
            if (!message_template || !receivedNonce) throw new Error("Invalid server response: missing auth template or nonce");

            // Store nonce for submission
            localStorage.setItem("notary_bind_nonce", receivedNonce);

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const sig = await signer.signMessage(message_template);
            
            setSignature(sig);
            setIsWalletSigned(true);
            toast({ title: "Signature Valid", description: "Wallet bound to professional ID." });
        } catch (err: any) {
            toast({ title: "Signing Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFinalizeVerification = async () => {
        if (!signature || !faceDescriptor || !applicationId) return;
        const wallet = localStorage.getItem("connectedWallet");
        if (!wallet) {
            toast({ title: "Wallet Missing", description: "Please connect wallet again.", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            const storedNonce = localStorage.getItem("notary_bind_nonce");
            if (!storedNonce) {
                toast({ title: "Session Expired", description: "Please sign your wallet again to refresh the session.", variant: "destructive" });
                setIsWalletSigned(false);
                setSignature(null);
                return;
            }
            await apiClient.post(`/api/notaries/applications/${applicationId}/verify`, { 
                signature, 
                faceDescriptor,
                walletAddress: wallet,
                nonce: storedNonce
            });

            toast({ title: "KYC Verified & Locked", description: "Identity locked for review." });
            localStorage.removeItem("bbsns_resuming_id");
            localStorage.removeItem(DRAFT_KEY);
            localStorage.removeItem("notary_bind_nonce");
            setStep(4);
        } catch (err: any) {
            toast({ title: "Verification Error", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] text-slate-50 selection:bg-primary/30 flex flex-col items-center justify-center p-4">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
                <motion.button
                    onClick={() => step > 1 ? setStep(step - 1) : router.back()}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group mb-4"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-widest text-glow">
                        {step > 1 ? `Phase ${step - 1} Clear` : "Exit Bridge"}
                    </span>
                </motion.button>

                <div className="bg-[#0f172a]/40 backdrop-blur-3xl border border-white/5 p-8 md:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden transition-all duration-700">
                    <AnimatePresence mode="wait">
                        {step === 1 ? (
                            <motion.div key="step1" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-8">
                                <div className="text-center space-y-4">
                                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                                        <FileText size={32} />
                                    </div>
                                    <h1 className="text-3xl font-extrabold tracking-tight">Official Registration</h1>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Full Legal Name</Label>
                                            <Input placeholder="As shown on ID" className={cn("bg-slate-950/50 border-white/5 h-12 text-white", validationErrors.name && "border-red-500/50")} value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
                                            {validationErrors.name && <p className="text-[10px] text-red-500/80 font-bold ml-1">Realistic Name Required</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Official Email</Label>
                                            <Input type="email" placeholder="professional@email.com" className={cn("bg-slate-950/50 border-white/5 h-12 text-white", validationErrors.email && "border-red-500/50")} value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Nationality</Label>
                                            <Popover open={openNationality} onOpenChange={setOpenNationality}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between h-12 px-4 bg-slate-950/50 border-white/5 text-sm">
                                                        <span>{selectedNationality.flag} {selectedNationality.name}</span>
                                                        <Globe className="h-4 w-4 opacity-40" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0 bg-slate-950 border-white/10">
                                                    <Command>
                                                        <CommandInput placeholder="Search country..." />
                                                        <CommandList>
                                                            {countries.map((c) => (
                                                                <CommandItem key={c.code} onSelect={() => { setSelectedNationality(c); setOpenNationality(false); }}>
                                                                    {c.flag} {c.name}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Mobile Number (10 Digits)</Label>
                                            <Input placeholder="E.g. 9876543210" className={cn("bg-slate-950/50 border-white/5 h-12 text-white", validationErrors.phone && "border-red-500/50")} value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">National ID</Label>
                                            <Input placeholder="ID Card Number" className={cn("bg-slate-950/50 border-white/5 h-12 text-white", validationErrors.nationalId && "border-red-500/50")} value={formData.nationalId} onChange={(e) => handleInputChange("nationalId", e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">License Number</Label>
                                            <Input placeholder="Official License" className={cn("bg-slate-950/50 border-white/5 h-12 text-white", validationErrors.license && "border-red-500/50")} value={formData.license} onChange={(e) => handleInputChange("license", e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Professional Experience (Years)</Label>
                                            <Input 
                                                type="number" 
                                                placeholder="Number of years practice" 
                                                className="bg-slate-950/50 border-white/5 h-12 text-white" 
                                                value={formData.experience} 
                                                onChange={(e) => handleInputChange("experience", e.target.value)} 
                                                min="0"
                                                max="60"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <Button type="button" className="w-full h-14 text-sm font-bold bg-primary hover:bg-primary/90" onClick={handleSubmitPhase1} disabled={isLoading || !isPhase1Valid}>
                                            {isLoading ? "Validating..." : "Initiate Verification"}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : step === 2 ? (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 text-center py-10">
                                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6">
                                    <Camera size={40} />
                                </div>
                                <h2 className="text-3xl font-bold">Biometric Liveness</h2>
                                <div className="bg-slate-950/80 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-3xl max-w-md mx-auto aspect-video relative">
                                    <LivenessCheck onComplete={(desc) => {
                                        setFaceDescriptor(desc);
                                        setIsLivenessDone(true);
                                        toast({ title: "Verified", description: "Identity signal locked." });
                                        setTimeout(() => setStep(3), 2000);
                                    }} />
                                </div>
                            </motion.div>
                        ) : step === 3 ? (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                                <div className="text-center space-y-4">
                                    <div className="mx-auto w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary shadow-inner">
                                        <Wallet size={40} />
                                    </div>
                                    <h2 className="text-3xl font-bold">Cryptographic Binding</h2>
                                </div>

                                <div className={cn("p-6 rounded-[2rem] border transition-all duration-700", isWalletSigned ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-950/50 border-white/5")}>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", isWalletSigned ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-500")}>
                                                <Lock size={24} />
                                            </div>
                                            <div className="space-y-0.5">
                                                <h4 className="font-bold text-sm">Ref: {referenceId || "---"}</h4>
                                            </div>
                                        </div>
                                        <Button onClick={handleSignWallet} disabled={isWalletSigned || isLoading} className="h-10 px-6 font-bold text-xs uppercase rounded-xl">
                                            {isWalletSigned ? "Signed" : "Sign & Bind"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4">
                                    {isLivenessDone && isWalletSigned && (
                                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                            <Button className="w-full h-16 text-lg font-extrabold bg-blue-600 hover:bg-blue-500 rounded-2xl uppercase" onClick={handleFinalizeVerification} disabled={isLoading}>
                                                {isLoading ? "Locking..." : "Finalize Registration"}
                                            </Button>
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        ) : step === 4 ? (
                            <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8 flex flex-col items-center py-10">
                                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.1)] border border-emerald-500/20">
                                    <CheckCircle2 size={48} className="animate-in fade-in zoom-in duration-700" />
                                </div>
                                <div className="space-y-4">
                                    <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">Registration Successful</h1>
                                    <p className="text-slate-400 text-lg max-w-md mx-auto">Your identity has been cryptographically secured and queued for review.</p>
                                    <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl inline-block mt-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Reference ID</p>
                                        <p className="text-xl font-mono text-primary tracking-wider">{referenceId}</p>
                                    </div>
                                </div>
                                <Button onClick={() => router.push("/")} className="w-full max-w-xs h-14 bg-slate-50 hover:bg-white text-slate-950 font-bold rounded-2xl transition-all shadow-xl shadow-white/5">
                                    Return to Home
                                </Button>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </div>

            <style jsx global>{`
                .text-glow {
                    text-shadow: 0 0 10px rgba(59,130,246,0.5);
                }
                .shadow-3xl {
                    box-shadow: 0 35px 60px -15px rgba(0, 0, 0, 0.5);
                }
            `}</style>
        </div>
    );
}
