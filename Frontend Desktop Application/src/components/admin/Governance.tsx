import { useState, useEffect } from "react"
import {
    Gavel,
    Plus,
    CheckCircle2,
    XCircle,
    Clock,
    ShieldAlert,
    UserPlus,
    UserMinus,
    Ban,
    Loader2,
    ShieldCheck,
    Globe,
    ExternalLink,
    Eye,
    ChevronRight,
    ArrowLeft,
    Users,
    Users2,
    Shield,
    Activity,
    Settings,
    Zap,
    FileText,
    Trash2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card"
import { Button } from "../ui/button";
import { useConfig } from "../../contexts/ConfigAuthority";
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "sonner"
import api from "../../services/api";

interface Proposal {
    id: number
    title: string
    description: string
    type: string
    target_id: string
    proposer_id: number
    proposer_name: string
    status: 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled'
    approvals: number
    rejections: number
    my_vote: 'approve' | 'reject' | null
    created_at: string
    expires_at: string
    threshold: number
    participation_scope: 'admin' | 'notary' | 'all'
    execution_tx_hash?: string
    my_vote_hash?: string
    on_chain_tx_index?: number
    on_chain_submission_time?: number
    on_chain_confirmations?: number
    on_chain_executed?: boolean
}

interface GovernanceProps {
    role: "admin" | "notary";
    user: any;
}

const PROPOSAL_PRESETS = [
    {
        id: "add_admin",
        label: "Promote to Admin",
        icon: UserPlus,
        type: "add_admin",
        title: "Promote User to Administrator",
        description: "Elevate the target user account to have full administrative control and governance participation rights."
    },
    {
        id: "remove_admin",
        label: "Demote Admin",
        icon: UserMinus,
        type: "remove_admin",
        title: "Revoke Administrative Privileges",
        description: "Remove administrative access from the target account and return them to standard user status."
    },
    {
        id: "ban_user",
        label: "Ban User",
        icon: Ban,
        type: "ban_user",
        title: "Deactivate User Account",
        description: "Formally suspend all system access for the target wallet/ID due to malicious activity or TOS violations."
    },
    {
        id: "unban_user",
        label: "Unban User",
        icon: UserPlus,
        type: "unban_user",
        title: "Reactivate User Account",
        description: "Restore full system access to a previously deactivated user account."
    },
    {
        id: "change_threshold",
        label: "Change Threshold",
        icon: Settings,
        type: "change_threshold",
        title: "Update Consensus Threshold",
        description: "Modify the number of signatures required to execute Multi-Sig transactions."
    },
    {
        id: "remove_notary",
        label: "Remove Notary",
        icon: UserMinus,
        type: "remove_notary",
        title: "Revoke Notary Certification",
        description: "Formally remove a notary from the registry. This will revoke their on-chain signing rights and system role."
    },
    {
        id: "add_notary",
        label: "Promote Notary",
        icon: UserPlus,
        type: "add_notary",
        title: "Approve New Notary Authority",
        description: "Promote the target user to Notary status, granting them document verification and signing privileges."
    },
    {
        id: "custom",
        label: "Custom Proposal",
        icon: Plus,
        type: "system_upgrade",
        title: "",
        description: ""
    },
]

interface SystemSettings {
    address: string
    threshold: number
    timelockDelay: number
    signers: string[]
}

function TimelockCountdown({ submissionTime, delay, currentTime }: { submissionTime: number, delay: number, currentTime: number }) {
    const unlockTime = submissionTime + delay
    const remaining = unlockTime - currentTime

    if (remaining <= 0) {
        return (
            <div className="flex items-center text-emerald-400 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <ShieldCheck className="h-3 w-3 mr-1" /> Governance Lock Released
            </div>
        )
    }

    const hours = Math.floor(remaining / 3600)
    const minutes = Math.floor((remaining % 3600) / 60)
    const seconds = remaining % 60

    return (
        <div className="flex items-center text-amber-400 text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <Clock className="h-3 w-3 mr-1" />
            Lockdoor Active: {hours}h {minutes}m {seconds}s
        </div>
    )
}

function GovernanceHealthWidget({ settings }: { settings: SystemSettings | null }) {
    if (!settings) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 group hover:bg-primary/10 transition-all">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Network Quorum</p>
                    <Shield className="h-3 w-3 text-primary/20" />
                </div>
                <div className="flex items-baseline gap-1">
                    {settings.threshold !== undefined ? (
                        <>
                            <span className="text-xl font-black text-primary">{settings.threshold}</span>
                            <span className="text-[10px] font-bold text-primary/40 uppercase">/ {Array.isArray(settings?.signers) ? settings.signers.length : "..."} Signers</span>
                        </>
                    ) : (
                        <span className="text-[10px] font-bold text-primary/40 uppercase animate-pulse">Calculating Quorum...</span>
                    )}
                </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 group hover:bg-amber-500/10 transition-all">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/40">Timelock Delay</p>
                    <Clock className="h-3 w-3 text-amber-500/20" />
                </div>
                <div className="flex items-baseline gap-1">
                    {settings.timelockDelay !== undefined ? (
                        <>
                            <span className="text-xl font-black text-amber-500">{settings.timelockDelay / 3600}</span>
                            <span className="text-[10px] font-bold text-amber-500/40 uppercase">Hours Active</span>
                        </>
                    ) : (
                        <span className="text-[10px] font-bold text-amber-500/40 uppercase animate-pulse">Syncing Delay...</span>
                    )}
                </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 group hover:bg-emerald-500/10 transition-all">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/40">Multi-Sig Guard</p>
                    <Activity className="h-3 w-3 text-emerald-500/20" />
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-emerald-500">Live</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 ml-1 animate-pulse" />
                </div>
            </div>
        </div>
    )
}

export function Governance({ role, user }: GovernanceProps) {
    const [proposals, setProposals] = useState<Proposal[]>([])
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [isVoting, setIsVoting] = useState<number | null>(null)
    const [isExecuting, setIsExecuting] = useState<number | null>(null)
    const [isCancelling, setIsCancelling] = useState<number | null>(null)
    const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null)
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000))
    const [allNotaries, setAllNotaries] = useState<any[]>([])
    const [targetNotaries, setTargetNotaries] = useState<number[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const { config } = useConfig();

    // Use DB adminCount from backend (if available) for accuracy; fallback to on-chain signers
    const isSingleAdmin = systemSettings &&
        systemSettings.threshold === 1 &&
        (systemSettings.adminCount !== undefined
            ? systemSettings.adminCount === 1
            : systemSettings.signers && systemSettings.signers.length === 1);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    const selectedProposal = proposals.find(p => p.id === selectedProposalId)

    // Form State
    const [selectedPreset, setSelectedPreset] = useState("add_admin")
    const [formData, setFormData] = useState({
        title: PROPOSAL_PRESETS[0].title,
        description: PROPOSAL_PRESETS[0].description,
        type: PROPOSAL_PRESETS[0].type,
        target_id: "",
        participation_scope: "admin",
        duration_hours: "168"
    })

    const fetchSystemSettings = async () => {
        try {
            const data = await api.getMultisigSettings()
            // 🛡️ [RESILIENCE] Accept 'degraded' state as valid data shape or check for keys
            if (data && typeof data === 'object' && (data.address || data.status === 'degraded')) {
                setSystemSettings(data)
            } else {
                console.warn("[GOV_WARN] MultiSig settings returned invalid data shape:", data);
                setSystemSettings(null);
            }
        } catch (err) {
            console.error("Fetch System Settings Error:", err)
            setSystemSettings(null);
        }
    }

    const fetchProposals = async () => {
        setIsLoading(true)
        try {
            const data = await api.getProposals()
            
            // 🛡️ [SECURITY] Hardened array access to prevent renderer crash
            const proposalsArray = Array.isArray(data) ? data : [];

            // Try to enrich with on-chain transaction data
            try {
                const multisigData = await api.getMultiSigTransactions()
                const txArray = Array.isArray(multisigData?.transactions) ? multisigData.transactions : [];
                
                const enriched = proposalsArray.map((p: any) => {
                    if (!p) return p;
                    const tx = txArray.find((t: any) => t.index === p.on_chain_tx_index)
                    if (tx) {
                        return {
                            ...p,
                            on_chain_submission_time: tx.submissionTime,
                            on_chain_confirmations: tx.numConfirmations,
                            on_chain_executed: tx.executed
                        }
                    }
                    return p
                })
                setProposals(enriched)
            } catch (e) {
                console.warn("Could not enrich with multisig data:", e)
                setProposals(proposalsArray)
            }
        } catch (err) {
            console.error("Fetch Proposals Error:", err)
            toast.error("Failed to load proposals")
            setProposals([]) // 🛡️ Maintain stable state on failure
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchProposals()
        fetchSystemSettings()

        if (role === 'admin') {
            api.getNotaries()
                .then(data => setAllNotaries(Array.isArray(data) ? data : []))
                .catch(err => {
                    console.error("[GOV_NOTARIES_FAIL]", err);
                    setAllNotaries([]);
                });
        }

        const timer = setInterval(() => {
            setCurrentTime(Math.floor(Date.now() / 1000))
        }, 1000)

        return () => clearInterval(timer)
    }, [])

    const handlePresetChange = (presetId: string) => {
        setSelectedPreset(presetId)
        const preset = PROPOSAL_PRESETS.find(p => p.id === presetId)
        if (preset) {
            setFormData({
                ...formData,
                type: preset.type,
                title: preset.title,
                description: preset.description
            })
        }
    }

    const handleCreateProposal = async () => {
        if (!formData.title || !formData.target_id) {
            toast.error("Please provide a title and target ID for the proposal.")
            return
        }

        setIsCreating(true)
        try {
            // 1. Create DB Proposal
            const proposal = await api.createProposal({
                ...formData,
                target_notaries: targetNotaries
            })
            toast.success("Proposal drafted! Initializing on-chain submission...")

            const cleanId = proposal.id; // DB ID

            // 2. Prepare On-Chain Data & Handle Signing
            // @ts-ignore
            if (window.ethereum) {
                const prepData = await api.prepareProposalOnChain(cleanId);

                // 3. User Sign (EIP-712 Submit)
                // @ts-ignore
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                // @ts-ignore
                const signature = await window.ethereum.request({
                    method: "eth_signTypedData_v4",
                    params: [accounts[0], JSON.stringify({
                        domain: prepData.domain,
                        types: prepData.types,
                        primaryType: "Submit",
                        message: prepData.message
                    })],
                });

                // 4. Relay Signature
                await api.submitProposalOnChain(cleanId, signature);
                toast.success("Proposal submitted to Multi-Sig On-Chain!");
                setFormData({ ...formData, title: "", description: "", target_id: "", duration_hours: "168" })
                fetchProposals()
            } else {
                // 🛡️ [REMOTE_FALLBACK] Handle creation via remote handshake
                console.log("[GOV] No local wallet. Starting Remote Submit Handshake...");
                toast.info("Wallet audit required. Opening secure bridge...");

                const session = await api.request('/api/governance/remote/submit/session', {
                    method: 'POST',
                    body: JSON.stringify({ proposalId: cleanId })
                });

                // Get Config and Open Browser
                const configRes = await api.getSystemConfig();
                const baseAuthUrl = (configRes.remoteAuthUrl || "https://auth.bbsns.online").replace(/\/$/, "");
                const webAppUrl = `${baseAuthUrl}/?mode=gov-submit&sessionId=${session.sessionId}`;

                // @ts-ignore
                if (window.electronAPI) {
                    // @ts-ignore
                    window.electronAPI.openExternal(webAppUrl);
                } else {
                    window.open(webAppUrl, '_blank');
                }

                // Poll for completion
                let pollCount = 0;
                const pollInterval = setInterval(async () => {
                    pollCount++;
                    try {
                        const status = await api.request(`/api/governance/remote/submit/status/${session.sessionId}`);
                        if (status.status === 'authorized') {
                            clearInterval(pollInterval);
                            toast.success("Governance submission authorized!");
                            setFormData({ ...formData, title: "", description: "", target_id: "", duration_hours: "168" })
                            fetchProposals();
                            setIsCreating(false);
                        } else if (status.status === 'failed' || pollCount > 60) {
                            clearInterval(pollInterval);
                            toast.error("Submission handshake failed or timed out.");
                            setIsCreating(false);
                        }
                    } catch (e) {
                        console.error("Submit Poll Error:", e);
                    }
                }, 2000);
                
                // Return early so finally doesn't set isCreating(false) immediately
                return;
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to submit proposal chain-side")
        } finally {
            // @ts-ignore
            if (window.ethereum) setIsCreating(false)
        }
    }

    const handleVote = async (proposalId: number, decision: 'approve' | 'reject') => {
        setIsVoting(proposalId)
        try {
            // 1. Check for Local Wallet (MetaMask)
            // @ts-ignore
            if (window.ethereum) {
                const now = Date.now();
                const message = `BBSNS Governance Vote\nProposal ID: ${proposalId}\nDecision: ${decision}\nTimestamp: ${now}`
                // @ts-ignore
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
                // @ts-ignore
                const signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [message, accounts[0]]
                })

                // Submit to Backend
                const data = await api.voteOnProposal(proposalId, decision, signature, now)
                if (data.executed) {
                    toast.success("Proposal Executed! The threshold was met.")
                } else {
                    toast.success("Vote recorded successfully")
                }
                fetchProposals()
                setIsVoting(null)
                return;
            }

            // 2. Fallback: Remote Signing (Electron Environment)
            console.log("[GOV] window.ethereum not found. Starting Remote Sign Handshake...");
            toast.info("Opening system browser for secure wallet audit...")

            const session = await api.request('/api/governance/remote/vote/session', {
                method: 'POST',
                body: JSON.stringify({ proposalId, decision })
            });

            const baseAuthUrl = (config?.remoteAuthUrl || "https://auth.bbsns.online").replace(/\/$/, "");
            const webAppUrl = `${baseAuthUrl}/?mode=gov-vote&sessionId=${session.sessionId}`;

            // Open System Browser
            // @ts-ignore
            if (window.electronAPI) {
                           window.electronAPI.openExternal(webAppUrl);
            } else {
                window.open(webAppUrl, '_blank');
            }

            // 3. Polling for Completion
            let pollCount = 0;
            const pollMax = 60; // 2 minutes max
            const pollInterval = setInterval(async () => {
                pollCount++;
                try {
                    const status = await api.request(`/api/governance/remote/vote/status/${session.sessionId}`);
                    if (status.status === 'authorized') {
                        clearInterval(pollInterval);
                        toast.success("Audit handshake complete. Vote recorded.");
                        setIsVoting(null);
                        fetchProposals();
                    } else if (status.status === 'expired' || status.status === 'failed') {
                        clearInterval(pollInterval);
                        toast.error("Handshake expired or failed.");
                        setIsVoting(null);
                    } else if (pollCount >= pollMax) {
                        clearInterval(pollInterval);
                        toast.error("Request timed out. Please try again.");
                        setIsVoting(null);
                    }
                } catch (e) {
                    console.error("Poll Error:", e);
                }
            }, 2000);

        } catch (err: any) {
            toast.error(err.message || "Failed to submit vote")
            setIsVoting(null)
        }
    }

    const handleCancelProposal = async (id: number) => {
        if (!window.confirm("PROTOCOL ADVISORY: You are about to cancel this proposal. This action will permanently revoke its active status. Proceed?")) return;

        setIsCancelling(id);
        try {
            await api.request(`/api/governance/proposals/${id}`, { method: 'DELETE' });
            toast.success("Governance Proposal Cancelled Successfully");
            fetchProposals();
            setSelectedProposalId(null);
        } catch (err: any) {
            console.error("Cancel Proposal Error:", err);
            toast.error(err.message || "Authority Denied: Cancellation Failed");
        } finally {
            setIsCancelling(null);
        }
    }

    const handleExecuteProposal = async (proposalId: number) => {
        setIsExecuting(proposalId)
        try {
            toast.info("Initializing blockchain-first execution pipeline...")
            const res = await api.executeProposal(proposalId)
            
            if (res.warning) {
                toast.warning(res.warning)
            } else {
                toast.success("Proposal executed successfully! On-chain and Off-chain states synced.")
            }
            
            fetchProposals()
            fetchSystemSettings()
        } catch (err: any) {
            console.error("[GOV_EXECUTE_FAIL]", err)
            toast.error(err.message || "Execution failed. Check relayer logs.")
        } finally {
            setIsExecuting(null)
        }
    }

    if (selectedProposal) {

        return (
            <div className="flex-1 flex flex-col min-h-0 bg-background">
                <div className="flex-none p-8 pt-12 pb-2">
                    <Button
                        variant="ghost"
                        className="mb-6 hover:bg-muted/50 text-muted-foreground"
                        onClick={() => setSelectedProposalId(null)}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to List
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-2 pb-24 custom-scrollbar">

                <div className="max-w-3xl mx-auto space-y-6">
                    {isSingleAdmin && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                <Zap className="h-5 w-5 text-emerald-400 animate-pulse" />
                            </div>
                            <div>
                                <p className="text-emerald-400 font-black uppercase tracking-tighter text-xs">Single Admin Mode Active</p>
                                <p className="text-emerald-400/60 text-[10px] font-bold">Your signature is authoritative. Actions execute immediately upon approval.</p>
                            </div>
                        </div>
                    )}
                    <Card className="border-primary/20 shadow-2xl shadow-black/40 overflow-hidden rounded-3xl group transition-all">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2">
                                    <Badge variant="outline" className={`capitalize py-1 px-3 rounded-md font-bold text-[10px] tracking-widest ${selectedProposal.status === 'executed' ? 'bg-primary/10 text-primary border-primary/20' :
                                        selectedProposal.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            'bg-muted text-muted-foreground border-border'
                                        }`}>
                                        {selectedProposal.status}
                                    </Badge>
                                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 py-1 px-3 rounded-md font-bold text-[10px] tracking-widest flex items-center">
                                        {selectedProposal.participation_scope === 'all' ? <Globe className="h-3 w-3 mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                                        {selectedProposal.participation_scope}
                                    </Badge>
                                </div>
                                <span className="text-xs font-mono text-muted-foreground font-bold">#PROP-{selectedProposal.id}</span>
                            </div>
                            <CardTitle className="text-foreground text-3xl font-black">{selectedProposal.title}</CardTitle>

                            {/* Timelock Countdown */}
                            {selectedProposal.status === 'active' &&
                                // @ts-ignore
                                selectedProposal.on_chain_submission_time && systemSettings && (
                                    <div className="mt-4">
                                        <TimelockCountdown
                                            // @ts-ignore
                                            submissionTime={selectedProposal.on_chain_submission_time}
                                            delay={systemSettings.timelockDelay}
                                            currentTime={currentTime}
                                        />
                                    </div>
                                )}

                            <div className="bg-muted/30 p-4 rounded-2xl border border-border mt-6 font-mono text-xs relative group/target">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-muted-foreground uppercase font-black tracking-tighter mb-1 text-[9px]">Target Identity</p>
                                        <p className="text-foreground break-all selectable pr-10">{selectedProposal.target_id}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 hover:bg-primary/20 text-muted-foreground hover:text-primary relative"
                                        onClick={() => handleCopy(selectedProposal.target_id, 'target')}
                                    >
                                        <FileText className="h-4 w-4" />
                                        {copiedId === 'target' && (
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-emerald-500 text-white text-[10px] font-black rounded shadow-xl animate-in fade-in zoom-in duration-200">
                                                COPIED!
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="pb-6 space-y-6">
                            <div className="bg-muted/40 p-6 rounded-2xl border border-border">
                                <p className="text-sm text-muted-foreground leading-relaxed italic">
                                    "{selectedProposal.description}"
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-primary/5 border border-primary/10 p-6 rounded-2xl text-center">
                                    <div className="text-4xl font-black text-primary">
                                        {selectedProposal.approvals} <span className="text-sm text-primary/40">/ {selectedProposal.threshold || 2}</span>
                                    </div>
                                    <div className="text-[10px] uppercase tracking-widest text-primary/40 font-black mt-1">Confirmed Approvals</div>
                                </div>
                                <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-2xl text-center">
                                    <div className="text-4xl font-black text-rose-400">{selectedProposal.rejections}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-rose-500/40 font-black mt-1">Network Rejections</div>
                                </div>
                            </div>

                            {/* Blockchain Receipts */}
                            <div className="space-y-3">
                                {selectedProposal.my_vote_hash && (
                                    <div className="flex items-center justify-between px-4 py-3 bg-primary/5 rounded-xl border border-primary/10">
                                        <div className="flex items-center">
                                            <ShieldCheck className="h-4 w-4 mr-3 text-primary" />
                                            <span className="text-[11px] text-primary/80 uppercase font-black">Cryptographic Vote Sealed</span>
                                        </div>
                                        <a
                                            href={`https://testnet.bscscan.com/tx/${selectedProposal.my_vote_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-primary hover:text-primary-foreground hover:bg-primary px-3 py-1 rounded-md border border-primary/30 transition-all font-bold flex items-center"
                                        >
                                            Verify <ExternalLink className="h-3 w-3 ml-2" />
                                        </a>
                                    </div>
                                )}
                                {selectedProposal.execution_tx_hash && (
                                    <div className="flex items-center justify-between px-4 py-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                                        <div className="flex items-center">
                                            <CheckCircle2 className="h-4 w-4 mr-3 text-blue-400" />
                                            <span className="text-[11px] text-blue-500/80 uppercase font-black">On-Chain Execution Success</span>
                                        </div>
                                        <a
                                            href={`https://testnet.bscscan.com/tx/${selectedProposal.execution_tx_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-blue-400 hover:text-white hover:bg-blue-500 px-3 py-1 rounded-md border border-blue-500/30 transition-all font-bold flex items-center"
                                        >
                                            Explorer <ExternalLink className="h-3 w-3 ml-2" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </CardContent>

                        <CardFooter className="flex flex-col gap-4 pt-4 pb-8 px-8 border-t border-border/50 mt-4">
                            {selectedProposal.status === 'active' ? (
                                <>
                                    {selectedProposal.my_vote ? (
                                        <div className={`w-full p-4 rounded-2xl border flex flex-col items-center justify-center space-y-2 animate-in zoom-in-95 duration-300 ${selectedProposal.my_vote === 'approve'
                                            ? 'bg-primary/10 border-primary/30'
                                            : 'bg-rose-500/10 border-rose-500/30'
                                            }`}>
                                            <div className="flex items-center space-x-2">
                                                {selectedProposal.my_vote === 'approve' ? (
                                                    <CheckCircle2 className="h-5 w-5 text-primary" />
                                                ) : (
                                                    <XCircle className="h-5 w-5 text-rose-500" />
                                                )}
                                                <span className={`font-black uppercase tracking-widest text-sm ${selectedProposal.my_vote === 'approve' ? 'text-primary' : 'text-rose-500'
                                                    }`}>
                                                    {selectedProposal.my_vote === 'approve' ? 'Approval Cast' : 'Rejection Cast'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-bold opacity-60">
                                                Your cryptographic choice is recorded and locked.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex gap-4 w-full">
                                            <Button
                                                className="flex-1 font-black h-14 rounded-2xl text-lg shadow-xl shadow-primary/10 transition-all bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20"
                                                onClick={() => handleVote(selectedProposal.id, 'approve')}
                                                disabled={isVoting !== null}
                                            >
                                                {isVoting === selectedProposal.id ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-3" />}
                                                Cast Approval
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex-1 font-black h-14 rounded-2xl text-lg border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white shadow-xl shadow-rose-500/10 transition-all bg-rose-500/5"
                                                onClick={() => handleVote(selectedProposal.id, 'reject')}
                                                disabled={isVoting !== null}
                                            >
                                                <XCircle className="h-6 w-6 mr-3" />
                                                Cast Rejection
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="w-full flex flex-col items-center justify-center p-6 bg-muted/30 rounded-2xl border border-border space-y-4">
                                    <div className="flex items-center text-xs text-muted-foreground font-black uppercase tracking-[0.2em]">
                                        <ShieldCheck className={`h-5 w-5 mr-3 ${selectedProposal.status === 'executed' ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                        {selectedProposal.status === 'executed' ? 'Governance Cycle Complete' : 'Consensus Finalized & Sealed'}
                                    </div>
                                    
                                    {selectedProposal.status === 'passed' && role === 'admin' && (
                                        <Button
                                            className="w-full font-black h-14 rounded-2xl text-lg shadow-xl shadow-emerald-500/10 transition-all bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-500/20"
                                            onClick={() => handleExecuteProposal(selectedProposal.id)}
                                            disabled={isExecuting !== null}
                                        >
                                            {isExecuting === selectedProposal.id ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Zap className="h-6 w-6 mr-3" />}
                                            Execute On-Chain
                                        </Button>
                                    )}

                                    {selectedProposal.status === 'executed' && (
                                        <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/10">
                                            <CheckCircle2 size={12} />
                                            Action Applied Successfully
                                        </div>
                                    )}

                                    <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-tighter">
                                        {selectedProposal.status === 'executed' 
                                            ? "System state has been updated to reflect the approved changes."
                                            : "This proposal has reached its threshold and is awaiting administrative execution."}
                                    </p>
                                </div>
                            )}

                            {/* CANCEL BUTTON: Visible only within 1 hour and if not on-chain */}
                            {(() => {
                                const proposalAgeMs = Date.now() - new Date(selectedProposal.created_at).getTime();
                                const isRecent = proposalAgeMs < (24 * 3600000); // Extended to 24h for testing
                                const isNotOnChain = selectedProposal.on_chain_tx_index === null || selectedProposal.on_chain_tx_index === undefined;
                                const isAuthorized = role === 'admin' || (user?.id && selectedProposal.proposer_id === user.id);
                                
                                if (selectedProposal.status === 'active' && isNotOnChain && isRecent && isAuthorized) {
                                    return (
                                        <Button
                                            variant="ghost"
                                            className="w-full text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 font-black uppercase tracking-widest text-[10px] h-10 border border-rose-500/20"
                                            onClick={() => handleCancelProposal(selectedProposal.id)}
                                            disabled={isCancelling !== null}
                                        >
                                            {isCancelling === selectedProposal.id ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Trash2 className="h-3 w-3 mr-2" />}
                                            Withdraw Proposal (24h Window)
                                        </Button>
                                    );
                                }
                                return null;
                            })()}
                        </CardFooter>
                    </Card>
                </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="flex-none p-8 pt-12 pb-8 border-b border-border/50 bg-background">
                {isSingleAdmin && (
                    <div className="mb-6 bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Authority Status</p>
                                <p className="text-sm font-black text-foreground">Single Admin Enforcement Mode <span className="text-primary ml-2">● Active</span></p>
                            </div>
                        </div>
                        <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">Authoritative</Badge>
                    </div>
                )}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-foreground italic tracking-tighter uppercase leading-none mb-3">SYSTEM GOVERNANCE</h1>
                        <p className="text-sm text-slate-400 font-medium italic">Propose and vote on network-wide administrative actions</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <div className="p-8 pb-32">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        {/* LEFT COLUMN: Status and Proposals */}
                        <div className="lg:col-span-2 space-y-8">
                            {systemSettings ? (
                                <>
                                    <GovernanceHealthWidget settings={systemSettings} />
                                    <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 flex items-center">
                                                <Users2 className="h-3 w-3 mr-2" /> Signer Authority List
                                            </p>
                                            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 uppercase tracking-[0.2em] text-[8px] font-black px-2 py-0.5">
                                                Immutable Governance Truth
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(Array.isArray(systemSettings.signers) ? systemSettings.signers : []).map((s, i) => (
                                                <Badge 
                                                    key={i} 
                                                    variant="secondary" 
                                                    className="bg-primary/10 text-[10px] font-mono border-white/5 text-primary/70 selectable px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all cursor-pointer relative"
                                                    onClick={() => handleCopy(s, `signer-${i}`)}
                                                >
                                                    {(s || "").slice(0, 14)}...{(s || "").slice(-12)}
                                                    {copiedId === `signer-${i}` && (
                                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded shadow-lg z-50">
                                                            COPIED!
                                                        </span>
                                                    )}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-card border border-border/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center animate-pulse">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary/40 mb-3" />
                                    <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest italic">Syncing Administrative Parameters...</p>
                                </div>
                            )}

                            {/* Active Proposals Section */}
                            <div className="space-y-6 pt-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-foreground font-black uppercase tracking-tighter text-xl flex items-center italic">
                                        <Gavel className="h-5 w-5 mr-3 text-primary" />
                                        Active Governance Quorum
                                    </h3>
                                    {!isLoading && proposals.length > 0 && (
                                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black px-3">
                                            {proposals.length} PENDING
                                        </Badge>
                                    )}
                                </div>
                                
                                {/* Proposals will be rendered here by the map below */}

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center p-12 bg-card border border-border border-dashed rounded-2xl">
                            <Loader2 className="h-10 w-10 animate-spin text-primary/50 mb-4" />
                            <p className="text-muted-foreground">Loading proposals...</p>
                        </div>
                    ) : proposals.length === 0 ? (
                        <Card className="bg-card border-border border-dashed rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
                                <div className="p-4 bg-muted/50 rounded-full mb-4">
                                    <ShieldAlert className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <p className="font-semibold text-muted-foreground">No proposals pending</p>
                                <p className="text-xs text-gray-500 mt-2 max-w-[200px]">
                                    {role === 'notary'
                                        ? "There are currently no network-wide proposals requiring Notary consensus."
                                        : "Network stability is verified. No administrative actions required."
                                    }
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                            {/* Sticky column headers */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border/30">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proposal</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:block">Approvals</span>
                            </div>
                            {/* Scrollable list */}
                            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '400px' }}>
                                <div className="divide-y divide-border/30">
                                    {proposals
                                        .filter(p => (p.status as string) !== 'cancelled' && (p.status as string) !== 'rejected')
                                        .map((prop) => (
                                        <div
                                            key={prop.id}
                                            className={`p-3.5 transition-all cursor-pointer group flex items-center justify-between ${selectedProposalId === prop.id
                                                ? 'bg-primary/5'
                                                : 'bg-transparent hover:bg-muted/30'
                                                }`}
                                            onClick={() => setSelectedProposalId(prop.id)}
                                        >
                                            <div className="flex items-center space-x-4 min-w-0">
                                                <div className={`h-10 w-10 rounded-full flex items-center justify-center border shrink-0 ${selectedProposalId === prop.id
                                                    ? 'bg-primary/20 border-primary/30 text-primary'
                                                    : 'bg-muted/30 border-border/50 text-muted-foreground'
                                                    }`}>
                                                    <Gavel className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-[10px] font-black text-primary/40 shrink-0">#P{prop.id}</span>
                                                        <h4 className="text-sm font-bold text-foreground truncate max-w-[300px] tracking-tight">{prop.title}</h4>
                                                    </div>
                                                    <div className="flex items-center space-x-3 mt-1">
                                                        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                                                            {prop.type.replace('_', ' ')}
                                                        </span>
                                                        <span className="h-1 w-1 rounded-full bg-border" />
                                                        <span className="text-[10px] font-medium text-muted-foreground/40">
                                                            {new Date(prop.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-6 shrink-0">
                                                <div className="hidden sm:flex flex-col items-end space-y-1">
                                                    <div className="flex items-center text-[11px] font-black text-foreground/80">
                                                        <Users2 className="h-3 w-3 mr-1.5 text-primary/60" />
                                                        {prop.approvals} <span className="mx-1 text-muted-foreground/30">/</span> {systemSettings?.threshold || prop.threshold || 2}
                                                    </div>
                                                    {prop.status === 'active' && (
                                                        <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-primary transition-all duration-500" 
                                                                style={{ width: `${Math.min(100, (prop.approvals / (systemSettings?.threshold || prop.threshold || 2)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <ChevronRight className={`h-5 w-5 transition-transform ${selectedProposalId === prop.id ? 'text-primary translate-x-1' : 'text-muted-foreground/20 group-hover:text-muted-foreground/50'}`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Action Panel */}
            {role === 'admin' && (
                <div className="lg:col-span-1 sticky top-8">
                    <Card className="bg-card border border-border/50 shadow-2xl rounded-2xl overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border/50 pb-6">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Gavel className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-foreground font-black uppercase tracking-tighter text-lg leading-none">Initiate Action</CardTitle>
                                    <CardDescription className="text-primary/40 text-[10px] uppercase font-bold tracking-widest mt-1">Admin Governance Node</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-6 pt-6">

                            <div className="flex flex-col gap-2">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preset Protocol</label>
                                <Select value={selectedPreset} onValueChange={handlePresetChange}>
                                    <SelectTrigger className="bg-muted/50 border-border/50 text-foreground rounded-xl h-11">
                                        <SelectValue placeholder="Select a preset..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover text-popover-foreground !opacity-100 border-border shadow-2xl">
                                        {PROPOSAL_PRESETS.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                <div className="flex items-center">
                                                    <p.icon className="h-4 w-4 mr-2 text-primary" />
                                                    {p.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Action Label</label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g., Promote User to Admin"
                                    disabled={selectedPreset !== 'custom'}
                                    className="bg-muted/50 border-border/50 text-foreground rounded-xl h-11 focus:ring-primary/20"
                                />
                            </div>

                            <div className="flex flex-col gap-2">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {formData.type === 'change_threshold' ? "Target Threshold" : "Target Wallet / ID"}
                                </label>
                                <Input
                                    value={formData.target_id}
                                    onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                                    placeholder={formData.type === 'change_threshold' ? "e.g., 2" : "0x... or UUID"}
                                    type={formData.type === 'change_threshold' ? "number" : "text"}
                                    className="bg-muted/50 border-border/50 text-foreground rounded-xl h-11 font-mono text-sm"
                                />
                            </div>

                            <div className="flex flex-col gap-3">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Consensus Scope</label>
                                <div className="flex gap-2">
                                    {['admin', 'notary', 'all'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setFormData({ ...formData, participation_scope: s })}
                                            className={`flex-1 py-2 rounded-lg border text-[9px] font-black uppercase transition-all ${formData.participation_scope === s
                                                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                                                : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {formData.participation_scope !== 'admin' && (
                                <div className="flex flex-col gap-2">

                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-between">
                                        Targeted Notaries
                                    </label>
                                    <div className="flex flex-wrap gap-2 p-3 bg-black/20 border border-white/10 rounded-xl min-h-[44px]">
                                        {allNotaries.map((notary) => (
                                            <Badge
                                                key={notary.id}
                                                variant={targetNotaries.includes(notary.id) ? "default" : "outline"}
                                                className={`cursor-pointer transition-all text-[9px] font-black ${targetNotaries.includes(notary.id) ? "bg-primary text-primary-foreground border-none" : "bg-muted border-border text-muted-foreground hover:border-primary/50"}`}
                                                onClick={() => {
                                                    setTargetNotaries(prev =>
                                                        prev.includes(notary.id)
                                                            ? prev.filter(id => id !== notary.id)
                                                            : [...prev, notary.id]
                                                    )
                                                }}
                                            >
                                                {notary.name || notary.email}
                                            </Badge>
                                        ))}
                                        {allNotaries.length === 0 && <span className="text-[9px] text-slate-600 italic">No notaries indexed.</span>}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quorum Window</label>
                                <Select value={formData.duration_hours} onValueChange={(v) => setFormData({ ...formData, duration_hours: v })}>
                                    <SelectTrigger className="bg-black/20 border-white/10 text-white rounded-xl h-11 text-xs relative z-0">
                                        <SelectValue placeholder="Select duration..." />
                                    </SelectTrigger>
                                    <SelectContent className="!bg-[#07090e] border-white/10 text-white shadow-2xl z-[100] !opacity-100 backdrop-blur-none">
                                        <SelectItem value="1">1 Hour (Flash)</SelectItem>
                                        <SelectItem value="6">6 Hours</SelectItem>
                                        <SelectItem value="24">24 Hours</SelectItem>
                                        <SelectItem value="72">3 Days</SelectItem>
                                        <SelectItem value="168">7 Days (Standard)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">

                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Rationale</label>
                                <Textarea
                                    className="min-h-[100px] bg-black/20 border-white/10 text-white rounded-xl resize-none text-sm placeholder:text-slate-700"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Legal or technical justification..."
                                />
                            </div>

                            {/* Security Advisory */}
                            {(formData.type === 'remove_admin' || formData.type === 'add_admin' || formData.type === 'system_upgrade') && (
                                <div className={`p-4 rounded-xl border ${formData.type === 'add_admin' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                    <div className={`flex items-center font-black text-[10px] uppercase tracking-widest mb-2 ${formData.type === 'add_admin' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        <ShieldAlert className="h-4 w-4 mr-2" />
                                        SECURITY ADVISORY
                                    </div>
                                    <p className={`text-[10px] leading-relaxed italic font-medium ${formData.type === 'add_admin' ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                        {formData.type === 'add_admin' && "Adding an authority signature grants full root access."}
                                        {formData.type === 'remove_admin' && "Signer removal is permanent. Verify threshold safety."}
                                        {formData.type === 'system_upgrade' && "Logic upgrades affect all network transactions."}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="pb-8">
                            <Button
                                className="w-full bg-primary hover:bg-emerald-400 !text-zinc-950 font-black h-14 shadow-2xl shadow-primary/20 rounded-xl transition-all uppercase tracking-widest text-xs"
                                onClick={handleCreateProposal}
                                disabled={isCreating}
                            >
                                {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Plus className="h-5 w-5 mr-3 font-black" />}
                                SUBMIT PROPOSAL
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    </div>
</div>
</div>
);
}
