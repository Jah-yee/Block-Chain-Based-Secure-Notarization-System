"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Textarea } from "../../components/ui/textarea"
import { useToast } from "../../hooks/use-toast"
import {
    Check,
    Shield,
    Wallet,
    Camera,
    ArrowRight,
    ArrowLeft,
    FileText,
    Lock,
    UserCheck,
    Globe,
    CheckCircle2,
    Contact
} from "lucide-react"
import { cn } from "../../lib/utils"
import { countries } from "../../lib/countries"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../../components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../../components/ui/popover"
import { motion, AnimatePresence } from "framer-motion"
import { ethers } from "ethers"
import dynamic from "next/dynamic"

const LivenessCheck = dynamic(
    () => import("../../components/auth/liveness-check").then((mod) => mod.LivenessCheck),
    { ssr: false }
)

export default function RegisterNotaryPage() {
    const [step, setStep] = useState(1) // 1: Form, 2: Biometric, 3: Wallet Sign
    const [applicationId, setApplicationId] = useState<number | null>(null)
    const [isLivenessDone, setIsLivenessDone] = useState(false)
    const [isWalletSigned, setIsWalletSigned] = useState(false)
    const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
    const [signature, setSignature] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const [openCombobox, setOpenCombobox] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState(countries.find(c => c.code === "US") || countries[0])

    const [openNationality, setOpenNationality] = useState(false)
    const [selectedNationality, setSelectedNationality] = useState(countries.find(c => c.code === "US") || countries[0])

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        license: "",
        experience: "",
        password: "",
        nationalId: "",
    })

    const router = useRouter()
    const { toast } = useToast()

    const handleInputChange = (field: string, value: string) => {
        let filteredValue = value;
        if (field === "phone") filteredValue = value.replace(/[^\d+]/g, "");
        else if (field === "name") filteredValue = value.replace(/[^a-zA-Z\s]/g, "");
        else if (field === "nationalId" || field === "license") filteredValue = value.replace(/[^a-zA-Z0-9]/g, "");
        setFormData((prev) => ({ ...prev, [field]: filteredValue }));
    }

    const handleSubmitPhase1 = async () => {
        let wallet = localStorage.getItem("connectedWallet");
        if (!wallet && (window as any).ethereum) {
            try {
                const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
                wallet = accounts[0];
                if (wallet) localStorage.setItem("connectedWallet", wallet);
            } catch (e) { }
        }

        if (!wallet) {
            toast({ title: "Wallet Link Required", description: "Please connect MetaMask to link your professional identity.", variant: "destructive" });
            return;
        }

        const missing = [];
        if (!formData.name) missing.push("Full Name");
        if (!formData.email) missing.push("Email");
        if (!formData.password) missing.push("Password");
        if (!formData.license) missing.push("License Number");
        if (!formData.nationalId) missing.push("National ID");

        if (missing.length > 0) {
            toast({ title: "Missing Fields", description: `Please fill: ${missing.join(", ")}`, variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/notaries/applications/public`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.name,
                    email: formData.email,
                    password: formData.password,
                    walletAddress: wallet,
                    phone: `${selectedCountry.dial_code} ${formData.phone}`,
                    license: formData.license,
                    experience: formData.experience,
                    nationalId: formData.nationalId,
                    nationality: selectedNationality.name
                })
            });
            const data = await res.json();
            if (!res.ok) {
                // If application already exists, we check if it's one we can resume
                if (data.id && (['pending', 'APPLIED', 'KYC_VERIFIED'].includes(data.status))) {
                    setApplicationId(data.id);
                    localStorage.setItem("bbsns_resuming_id", data.id);
                    toast({
                        title: "Resuming Session",
                        description: `Found existing ${data.status} status. Syncing profile...`,
                        variant: "default"
                    });

                    // Always move to step 2 if they try to skip or re-fill step 1
                    setStep(2);
                    return;
                }
                throw new Error(data.error || "Submission failed");
            }

            setApplicationId(data.id);
            localStorage.setItem("bbsns_resuming_id", data.id);
            toast({ title: "Profile Secured", description: "Phase 1 complete. Proceeding to Biometric Verification." });
            setStep(2); // Auto-transition
        } catch (e: any) {
            // Check if the error contains a resumed state or if we can extract ID
            if (e.message.includes("Application already exists")) {
                toast({ title: "Resuming Application", description: "Found your previous record. Syncing session..." });
                // If we had a mechanism to get the ID from the error object, we'd use it here.
                // For now, let's hope the next attempt works or inform user.
            }
            toast({ title: "Submission Failed", description: e.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }

    const handleSignWallet = async () => {
        if (!applicationId || !window.ethereum) return;
        setIsLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const message = `BBSNS-NOTARY-BIND:${applicationId}`;
            const sig = await signer.signMessage(message);
            setSignature(sig);
            setIsWalletSigned(true);
            toast({ title: "Signature Valid", description: "Wallet bound to professional ID." });
        } catch (err: any) {
            toast({ title: "Signing Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }

    const handleFinalizeVerification = async () => {
        if (!signature || !faceDescriptor) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/notaries/applications/${applicationId}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signature, faceDescriptor })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Verification failed on server.");

            toast({ title: "KYC Verified & Locked", description: "Your application is now under administrative review." });
            router.push("/");
        } catch (err: any) {
            toast({ title: "Verification Error", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#020617] text-slate-50 selection:bg-primary/30">
            {/* Dynamic Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="relative z-10 container max-w-6xl mx-auto py-6 px-4">
                {/* Navigation */}
                <motion.button
                    onClick={() => step > 1 ? setStep(step - 1) : router.back()}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-10 group"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    {step > 1 ? `Back to Step ${step - 1}` : "Back to Home"}
                </motion.button>

                <div className="grid lg:grid-cols-12 gap-16 items-start">
                    {/* Left Side: Info & Steps */}
                    <motion.div
                        className="lg:col-span-5 space-y-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-6">
                                <Shield size={14} /> Official Registration
                            </div>
                            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                                Become a <br />
                                <span className="text-primary text-glow drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">Verified Notary</span>
                            </h1>
                            <p className="text-slate-400 text-lg leading-relaxed max-w-md">
                                Join our decentralized network of trusted professionals. Our automated registration ensures <span className="text-slate-200 font-medium">zero-trust security</span> through multi-factor authentication.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {[
                                { s: 1, title: "Intent & Info", desc: "Submit your professional credentials.", icon: FileText },
                                { s: 2, title: "Biometric Signal", desc: "Neural liveness verification.", icon: Camera },
                                { s: 3, title: "Wallet Binding", desc: "Cryptographic identity locking.", icon: Wallet },
                            ].map((item) => (
                                <div key={item.s} className="flex gap-5 group">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500",
                                        step === item.s
                                            ? "bg-primary border-primary text-white shadow-[0_0_25px_rgba(59,130,246,0.4)]"
                                            : (step > item.s ? "bg-emerald-500 border-emerald-500 text-white" : "bg-slate-900/50 border-slate-800 text-slate-500")
                                    )}>
                                        {step > item.s ? <Check size={22} /> : <item.icon size={22} />}
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className={cn(
                                            "font-bold text-lg transition-colors",
                                            step >= item.s ? "text-white" : "text-slate-500"
                                        )}>{item.title}</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 rounded-3xl bg-blue-500/5 border border-blue-500/10 space-y-4">
                            <h4 className="font-bold flex items-center gap-2 text-blue-400">
                                <Lock size={18} /> Privacy & Zero-Trust
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                We follow a strict zero-trust policy. Your biometric data is processed instantly and never stored in plain text. Unapproved applications are automatically purged to ensure permanent privacy.
                            </p>
                        </div>
                    </motion.div>

                    {/* Right Side: Form Content */}
                    <motion.div
                        className="lg:col-span-7"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="bg-[#0f172a]/40 backdrop-blur-3xl border border-slate-800/40 p-8 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden min-h-[550px] flex flex-col transition-all duration-500 hover:shadow-primary/5">
                            <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:opacity-5 transition-opacity">
                                <Shield size={160} />
                            </div>

                            <AnimatePresence mode="wait">
                                {step === 1 ? (
                                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 flex-1">
                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-3 group">
                                                <Label className="text-slate-300 font-semibold ml-1 group-focus-within:text-primary transition-colors">Full Legal Name</Label>
                                                <Input placeholder="As shown on ID" className="bg-slate-950/50 border-slate-800 h-14 text-lg text-white focus:ring-primary focus:border-primary/50 transition-all" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
                                            </div>
                                            <div className="space-y-3 group">
                                                <Label className="text-slate-300 font-semibold ml-1 group-focus-within:text-primary transition-colors">Official Email</Label>
                                                <Input type="email" placeholder="email@example.com" className="bg-slate-950/50 border-slate-800 h-14 text-lg text-white focus:ring-primary focus:border-primary/50 transition-all" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <Label className="text-slate-300 font-semibold ml-1">Nationality</Label>
                                            <Popover open={openNationality} onOpenChange={setOpenNationality}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full justify-between h-14 px-5 bg-slate-950/50 border-slate-800 hover:bg-slate-900/50">
                                                        <span className="flex items-center gap-3">
                                                            <span className="text-2xl">{selectedNationality.flag}</span>
                                                            <span className="text-lg font-medium text-slate-200">{selectedNationality.name}</span>
                                                        </span>
                                                        <Globe className="h-5 w-5 opacity-40 text-primary" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[400px] p-0 bg-slate-950 border-slate-800 shadow-2xl z-[100]">
                                                    <Command shouldFilter>
                                                        <CommandInput placeholder="Search countries..." className="h-14" />
                                                        <CommandList className="max-h-[300px]">
                                                            {countries.map((c) => (
                                                                <CommandItem key={c.code} value={c.name} onSelect={() => { setSelectedNationality(c); setOpenNationality(false); }} className="h-12">
                                                                    <span className="text-xl mr-3">{c.flag}</span> {c.name}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-8 items-start">
                                            {/* Identity Card */}
                                            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-2xl space-y-6">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                        <Shield size={18} />
                                                    </div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Identity Details</h3>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">Full Legal Name</Label>
                                                        <Input placeholder="As shown on ID" className="bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl mt-1.5" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
                                                    </div>
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">Official Email</Label>
                                                        <Input type="email" placeholder="email@example.com" className="bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl mt-1.5" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                                                    </div>
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">Access Password</Label>
                                                        <Input type="password" placeholder="••••••••" className="bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl mt-1.5" value={formData.password} onChange={(e) => handleInputChange("password", e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Contact & Verification Card */}
                                            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-2xl space-y-6">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                        <Contact size={18} />
                                                    </div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Verification Info</h3>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">National Identity Number</Label>
                                                        <Input placeholder="Personal ID Number" className="bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl mt-1.5" value={formData.nationalId} onChange={(e) => handleInputChange("nationalId", e.target.value)} />
                                                    </div>
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">Professional License</Label>
                                                        <Input placeholder="Official License Code" className="bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl mt-1.5" value={formData.license} onChange={(e) => handleInputChange("license", e.target.value)} />
                                                    </div>
                                                    <div className="group">
                                                        <Label className="text-xs font-bold text-slate-500 ml-1 group-focus-within:text-primary transition-colors uppercase tracking-wider">Mobile Contact</Label>
                                                        <div className="flex gap-2 mt-1.5">
                                                            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                                                <PopoverTrigger asChild>
                                                                    <div className="h-12 px-4 bg-[#0f172a]/40 border border-slate-800/60 font-bold text-primary text-lg rounded-xl flex items-center cursor-pointer">
                                                                        {selectedCountry.dial_code}
                                                                    </div>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="bg-slate-950 border-slate-800"><Command shouldFilter><CommandInput /><CommandList>{countries.map(c => (<CommandItem key={c.code} onSelect={() => { setSelectedCountry(c); setOpenCombobox(false); }}>{c.flag} {c.dial_code}</CommandItem>))}</CommandList></Command></PopoverContent>
                                                            </Popover>
                                                            <Input placeholder="Phone number" className="flex-1 bg-[#0f172a]/40 border-slate-800/60 h-12 text-base text-white focus:ring-primary/30 focus:border-primary/50 transition-all rounded-xl" value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 group">
                                            <Label className="text-slate-300 font-semibold ml-1 group-focus-within:text-primary transition-colors">Experience & Portfolio</Label>
                                            <Textarea
                                                placeholder="Briefly describe your professional background and notary experience..."
                                                className="bg-[#0f172a]/40 border-slate-800/60 min-h-[140px] p-5 text-base text-white focus:ring-primary focus:border-primary/50 backdrop-blur-md transition-all rounded-xl resize-none"
                                                value={formData.experience}
                                                onChange={(e) => handleInputChange("experience", e.target.value)}
                                            />
                                        </div>

                                        <div className="pt-4 mt-auto">
                                            <Button className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 group uppercase tracking-wide" onClick={handleSubmitPhase1} disabled={isLoading}>
                                                {isLoading ? "Validating..." : "Submit & Continue"}
                                                <ArrowRight className="ml-3 group-hover:translate-x-1 transition-transform" />
                                            </Button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    step === 2 ? (
                                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10 text-center flex-1 flex flex-col justify-center py-6">
                                            <div className="space-y-4">
                                                <div className="mx-auto w-24 h-24 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mb-2 shadow-inner">
                                                    <Camera size={48} />
                                                </div>
                                                <h2 className="text-3xl font-bold tracking-tight">Biometric Liveness</h2>
                                                <p className="text-slate-400 text-lg max-w-sm mx-auto">Center your face in the frame to confirm identity signal.</p>
                                            </div>

                                            <div className="bg-slate-950/80 rounded-[2rem] overflow-hidden border border-slate-800 shadow-3xl max-w-md mx-auto w-full aspect-video flex items-center justify-center relative group">
                                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                                <LivenessCheck onComplete={(desc) => {
                                                    setFaceDescriptor(desc);
                                                    setIsLivenessDone(true);
                                                    toast({ title: "Signal Valid", description: "Identity verified successfully." });
                                                    setTimeout(() => setStep(3), 2000);
                                                }} />
                                            </div>

                                            {isLivenessDone ? (
                                                <div className="flex items-center gap-3 text-emerald-400 font-bold justify-center py-4 px-8 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 max-w-xs mx-auto animate-in fade-in zoom-in duration-500">
                                                    <CheckCircle2 size={24} /> Neural Signal Locked
                                                </div>
                                            ) : (
                                                <div className="h-16" /> /* Placeholder to prevent jump */
                                            )}
                                        </motion.div>
                                    ) : (
                                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-12 flex-1 flex flex-col justify-center">
                                            <div className="text-center space-y-4">
                                                <div className="mx-auto w-24 h-24 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary shadow-inner">
                                                    <Wallet size={48} />
                                                </div>
                                                <h2 className="text-3xl font-bold tracking-tight">Cryptographic Binding</h2>
                                                <p className="text-slate-400 text-lg">Lock your professional profile to your wallet address.</p>
                                            </div>

                                            <div className={cn(
                                                "p-8 rounded-3xl border transition-all duration-700 mx-auto w-full max-w-lg",
                                                isWalletSigned ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-950/50 border-slate-800"
                                            )}>
                                                <div className="flex items-center justify-between gap-6">
                                                    <div className="flex items-center gap-5">
                                                        <div className={cn(
                                                            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform",
                                                            isWalletSigned ? "bg-emerald-500 text-white scale-110" : "bg-slate-800 text-slate-400"
                                                        )}>
                                                            <Lock size={28} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h4 className="font-bold text-xl">Wallet Signature</h4>
                                                            <p className="text-sm text-slate-500 font-mono tracking-tighter uppercase">ID_REF: {applicationId}</p>
                                                        </div>
                                                    </div>
                                                    <Button onClick={handleSignWallet} disabled={isWalletSigned || isLoading} variant={isWalletSigned ? "secondary" : "default"} className="h-14 px-8 font-bold text-lg rounded-xl">
                                                        {isWalletSigned ? "Signed ✓" : "Sign & Bind"}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-5 pt-8 mt-auto">
                                                <Button className="w-full h-16 text-2xl font-extrabold bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-900/40 rounded-2xl uppercase tracking-wider" disabled={!isWalletSigned || isLoading} onClick={handleFinalizeVerification}>
                                                    {isLoading ? "Locking Profile..." : "Finalize Registration"}
                                                </Button>
                                                <p className="text-xs text-center text-slate-500 px-12 leading-relaxed font-medium">
                                                    Once finalized, your data enters a secure review state. You will be cleared for on-chain operations within 24 hours.
                                                </p>
                                            </div>
                                        </motion.div>
                                    )
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>
            </div>

            <style jsx global>{`
                .text-glow {
                    text-shadow: 0 0 30px rgba(59,130,246,0.3);
                }
                .shadow-3xl {
                    box-shadow: 0 35px 60px -15px rgba(0, 0, 0, 0.5);
                }
                .focus-ring-glow:focus {
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 0 15px rgba(59, 130, 246, 0.1);
                }
            `}</style>
        </div>
    );
}

