"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
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
    Check,
    ShieldCheck
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { signSubmitAction, signConfirmAction, connectWallet } from "@/lib/web3"
import { useConfig } from "@/providers/ConfigProvider"
import { ethers } from "ethers"

import { apiClient } from "@/lib/api-client"

interface Proposal {
    id: number
    title: string
    description: string
    type: string
    target_id: string
    proposer_id: number
    proposer_name: string
    status: 'active' | 'passed' | 'rejected' | 'executed'
    approvals: number
    rejections: number
    my_vote: 'approve' | 'reject' | null
    created_at: string
    expires_at: string
    on_chain_tx_index?: number
    execution_tx_hash?: string
    signer_version?: number
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
        id: "custom",
        label: "Custom Proposal",
        icon: Plus,
        type: "system_upgrade",
        title: "",
        description: ""
    },
]

export function GovernancePanel() {
    const { config } = useConfig()
    const { user } = useWalletSession()
    const [proposals, setProposals] = useState<Proposal[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [isVoting, setIsVoting] = useState<number | null>(null)
    const [isSubmittingOnChain, setIsSubmittingOnChain] = useState<number | null>(null)
    const [multiSigAddress] = useState(config?.contracts.multisig || "")
    const { toast } = useToast()

    // Form State
    const [selectedPreset, setSelectedPreset] = useState("add_admin")
    const [formData, setFormData] = useState({
        title: PROPOSAL_PRESETS[0].title,
        description: PROPOSAL_PRESETS[0].description,
        type: PROPOSAL_PRESETS[0].type,
        target_id: ""
    })

    const fetchProposals = async () => {
        setIsLoading(true)
        try {
            const data = await apiClient.get('/governance/proposals')
            setProposals(data || [])
        } catch (err) {
            console.error("Fetch Proposals Error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchProposals()
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
            toast({
                title: "Incomplete Form",
                description: "Please provide a title and target ID for the proposal.",
                variant: "destructive"
            })
            return
        }

        setIsCreating(true)
        try {
            await apiClient.post('/governance/proposals', formData)

            toast({
                title: "Proposal Created",
                description: "Your proposal is now active for voting.",
            })
            setFormData({ ...formData, title: "", description: "", target_id: "" })
            fetchProposals()
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setIsCreating(false)
        }
    }

    const handleVote = async (proposalId: number, decision: 'approve' | 'reject') => {
        setIsVoting(proposalId)
        try {
            // 1. Signature Request (EIP-191)
            if (!window.ethereum) {
                throw new Error("MetaMask or compatible wallet not found.")
            }

            const message = `BBSNS Governance Vote\nProposal ID: ${proposalId}\nDecision: ${decision}\nTimestamp: ${Date.now()}`
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, accounts[0]]
            })

            // 2. Submit to Backend
            const data = await apiClient.post(`/governance/proposals/${proposalId}/vote`, { decision, signature })

            toast({
                title: data.executed ? "Proposal Executed!" : "Vote Recorded",
                description: data.executed
                    ? "The threshold was met and the action has been performed."
                    : "Your vote has been submitted and recorded on-chain.",
            })
            fetchProposals()
        } catch (err: any) {
            toast({
                title: "Voting Error",
                description: err.message || "Failed to sign or submit vote.",
                variant: "destructive"
            })
        } finally {
            setIsVoting(null)
        }
    }

    const handleSubmitOnChain = async (proposal: Proposal) => {
        setIsSubmittingOnChain(proposal.id)
        try {
            const { signer, chainId } = await connectWallet()

            // 1. Prepare Data for Multi-Sig
            const resData = await apiClient.post(`/governance/proposals/${proposal.id}/prepare-on-chain`)
            
            let targetAddr = resData.target || config?.contracts.documentRegistry || ""
            let value = "0"
            let data = "0x"
            const version = proposal.signer_version || 1

            // 2. Sign EIP-712 Submit
            const signature = await signSubmitAction(
                signer,
                chainId,
                multiSigAddress,
                targetAddr,
                value,
                data,
                version
            )

            // 3. Relay to Backend
            await apiClient.post(`/governance/proposals/${proposal.id}/submit-on-chain`, { signature })

            toast({
                title: "Submitted to Blockchain",
                description: "The proposal is now on the Multi-Sig queue.",
            })
            fetchProposals()
        } catch (err: any) {
            toast({
                title: "Submission Error",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setIsSubmittingOnChain(null)
        }
    }

    const handleConfirmOnChain = async (proposal: Proposal) => {
        setIsVoting(proposal.id)
        try {
            const { signer, chainId } = await connectWallet()

            const txIndex = proposal.on_chain_tx_index
            if (txIndex === undefined) throw new Error("Proposal is not yet on-chain.")
            const version = proposal.signer_version || 1

            // 1. Sign EIP-712 Confirm
            const signature = await signConfirmAction(
                signer,
                chainId,
                multiSigAddress,
                txIndex,
                version
            )

            // 2. Relay to Backend
            await apiClient.post(`/governance/proposals/${proposal.id}/confirm-on-chain`, { signature, txIndex })

            toast({
                title: "Confirmation Relayed",
                description: "Your on-chain confirmation has been successfully recorded.",
            })
            fetchProposals()
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setIsVoting(null)
        }
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Create Proposal Section */}
            <Card className="h-fit">
                <CardHeader>
                    <div className="flex items-center space-x-2">
                        <Gavel className="h-5 w-5 text-primary" />
                        <CardTitle>Initiate Proposal</CardTitle>
                    </div>
                    <CardDescription>Create a formal system action requiring administrative approval</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Select Preset Action</label>
                        <Select value={selectedPreset} onValueChange={handlePresetChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a preset..." />
                            </SelectTrigger>
                            <SelectContent>
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Proposal Title</label>
                        <Input
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g., Promote Jane Doe to Admin"
                            disabled={selectedPreset !== 'custom'}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Target ID / Wallet</label>
                        <Input
                            value={formData.target_id}
                            onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                            placeholder="User ID or Wallet Address"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Detailed Justification</label>
                        <Textarea
                            className="min-h-[100px]"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Explain why this action should be taken..."
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full"
                        onClick={handleCreateProposal}
                        disabled={isCreating}
                    >
                        {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Submit for Voting
                    </Button>
                </CardFooter>
            </Card>

            {/* System Status / Circuit Breaker */}
            <Card className="h-fit">
                <CardHeader>
                    <div className="flex items-center space-x-2">
                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                        <CardTitle>System Operations</CardTitle>
                    </div>
                    <CardDescription>Emergency circuit breakers and protocol parameter management</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            className="border-amber-500/20 hover:bg-amber-500/5 text-amber-500 h-16 flex flex-col items-center justify-center p-0"
                            onClick={() => {
                                setFormData({
                                    title: "Pause Document Notarizations",
                                    description: "Emergency pause for all new document registrations due to system maintenance or security alert.",
                                    type: "pause_registry",
                                    target_id: config?.contracts.documentRegistry || ""
                                });
                                toast({ title: "Template Loaded", description: "Review and click 'Submit for Voting' below." });
                            }}
                        >
                            <Ban className="h-5 w-5 mb-1" />
                            <span className="text-[10px] font-bold">Pause Registry</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="border-emerald-500/20 hover:bg-emerald-500/5 text-emerald-500 h-16 flex flex-col items-center justify-center p-0"
                            onClick={() => {
                                setFormData({
                                    title: "Unpause Document Notarizations",
                                    description: "Restoring system registration capabilities following audit or maintenance.",
                                    type: "unpause_registry",
                                    target_id: config?.contracts.documentRegistry || ""
                                });
                                toast({ title: "Template Loaded", description: "Review and click 'Submit for Voting' below." });
                            }}
                        >
                            <Check className="h-5 w-5 mb-1" />
                            <span className="text-[10px] font-bold">Unpause Registry</span>
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center italic">
                        Note: Circuit breakers require Multi-Sig consensus to activate.
                    </p>
                </CardContent>
            </Card>

            {/* Active Proposals Section */}
            <div className="space-y-6">
                <h3 className="text-lg font-semibold flex items-center">
                    <Clock className="h-5 w-5 mr-2 text-primary" />
                    Active Governance Quorum
                </h3>

                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : proposals.length === 0 ? (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                            <ShieldAlert className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                            <p className="font-medium text-muted-foreground">No proposals pending</p>
                            <p className="text-sm text-muted-foreground mt-1">All systems are currently operating within nominal parameters.</p>
                        </CardContent>
                    </Card>
                ) : (
                    proposals.map((prop) => (
                        <Card key={prop.id} className={prop.status !== 'active' ? "opacity-75 grayscale-[0.5]" : "border-primary/20 shadow-lg"}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant={prop.status === 'executed' ? "default" : "outline"} className="capitalize">
                                        {prop.status}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">#PROP-{prop.id}</span>
                                </div>
                                <CardTitle className="text-md mt-2">{prop.title}</CardTitle>
                                <CardDescription className="text-xs">
                                    Target: <code className="bg-muted px-1 rounded">{prop.target_id}</code>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-foreground/80 line-clamp-2 italic border-l-2 border-primary/20 pl-3">
                                    "{prop.description}"
                                </p>

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg text-center">
                                        <div className="text-xl font-bold text-emerald-500">{prop.approvals}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-bold">Approvals</div>
                                    </div>
                                    <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg text-center">
                                        <div className="text-xl font-bold text-rose-500">{prop.rejections}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-rose-500/70 font-bold">Rejections</div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2 pt-0">
                                {prop.status === 'active' ? (
                                    <>
                                        <div className="flex gap-2 w-full">
                                            <Button
                                                size="sm"
                                                variant={prop.my_vote === 'approve' ? "default" : "outline"}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-600/90 border-none text-white font-bold transition-colors"
                                                onClick={() => handleVote(prop.id, 'approve')}
                                                disabled={isVoting !== null || prop.my_vote !== null}
                                            >
                                                {isVoting === prop.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                                {prop.my_vote === 'approve' ? 'Approved' : 'Approve'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={prop.my_vote === 'reject' ? "destructive" : "outline"}
                                                className="flex-1"
                                                onClick={() => handleVote(prop.id, 'reject')}
                                                disabled={isVoting !== null || prop.my_vote !== null}
                                            >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                {prop.my_vote === 'reject' ? 'Rejected' : 'Reject'}
                                            </Button>
                                        </div>

                                        {prop.on_chain_tx_index === undefined && prop.status === 'active' && (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="w-full text-[10px] h-7"
                                                onClick={() => handleSubmitOnChain(prop)}
                                                disabled={isSubmittingOnChain !== null}
                                            >
                                                {isSubmittingOnChain === prop.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                                                Bridge to On-Chain Multi-Sig
                                            </Button>
                                        )}

                                        {prop.on_chain_tx_index !== undefined && prop.my_vote === 'approve' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full border-primary/40 text-primary text-[10px] h-7 hover:bg-primary/5"
                                                onClick={() => handleConfirmOnChain(prop)}
                                                disabled={isVoting !== null}
                                            >
                                                <Check className="h-3 w-3 mr-1" />
                                                Confirm on Multi-Sig (On-Chain)
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <div className="w-full space-y-2">
                                        <div className="w-full flex items-center justify-center p-2 rounded bg-muted/30 text-xs text-muted-foreground font-medium">
                                            <ShieldCheck className="h-3 w-3 mr-2" />
                                            Action Finalized
                                        </div>
                                        {prop.execution_tx_hash && (
                                            <a
                                                href={`https://testnet.bscscan.com/tx/${prop.execution_tx_hash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-center text-primary hover:underline truncate"
                                            >
                                                View On-Chain Proof: {prop.execution_tx_hash}
                                            </a>
                                        )}
                                    </div>
                                )}
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
