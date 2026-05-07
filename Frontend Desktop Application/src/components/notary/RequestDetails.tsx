import { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, FileText, Image as ImageIcon, User, Wallet, Hash, CheckCircle, XCircle, ArrowLeft, Loader2, ExternalLink, Coins } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import api from "../../services/api";

interface RequestDetailsProps {
    requestId: string;
    onBack: () => void;
}

export function RequestDetails({ requestId, onBack }: RequestDetailsProps) {
    const [zoom, setZoom] = useState(50);
    const [transcription, setTranscription] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [request, setRequest] = useState<any>(null);
    const [documentSummary, setDocumentSummary] = useState("");
    const [rejectionReason, setRejectionReason] = useState("");
    const [fileUrl, setFileUrl] = useState<string | null>(null);

    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        action: "approve" | "reject" | null;
    }>({ open: false, action: null });

    const [ntkBalance, setNtkBalance] = useState<string>("...");

    useEffect(() => {
        loadDocument();
        return () => {
            if (fileUrl) URL.revokeObjectURL(fileUrl);
        };
    }, [requestId]);

    const loadDocument = async () => {
        setLoading(true);
        try {
            const doc = await api.getDocument(requestId);
            setRequest(doc);

            // Fetch the actual file securely
            const blob = await api.getDocumentFile(requestId, doc.mimetype);
            const url = URL.createObjectURL(blob);
            setFileUrl(url);

            // Fetch NTK balance
            const user = await api.getMe();
            if (user?.wallet_address) {
                const balRes = await api.getOnChainBalance(user.wallet_address, 'ntk');
                setNtkBalance(balRes.balance);
            }

        } catch (err: any) {
            console.error(err);
            toast.error("Failed to load document details.");
            onBack();
        } finally {
            setLoading(false);
        }
    };

    const handleAction = (action: "approve" | "reject") => {
        setDocumentSummary("");
        setRejectionReason("");
        setConfirmDialog({ open: true, action });
    };

    const confirmAction = async () => {
        if (!confirmDialog.action) return;
        const status = confirmDialog.action === "approve" ? "approved" : "rejected";
        
        if (confirmDialog.action === "approve" && !documentSummary.trim()) {
            toast.error("Please provide a document summary");
            return;
        }
        if (confirmDialog.action === "reject" && !rejectionReason.trim()) {
            toast.error("Please provide a rejection reason");
            return;
        }

        setSubmitting(true);

        // 🛡️ [DESKTOP_REMOTE_SIGNING] Handle Electron environment without window.ethereum
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
            console.log("[DEBUG] Desktop environment detected. Initiating Remote Signing Flow...");
            await initiateRemoteSigning(status);
            return;
        }

        try {
            // 🔐 EIP-712 SIGNATURE REQUIRED (Browser Flow)
            if (!(window as any).ethereum) {
                throw new Error("MetaMask is required to sign this action.");
            }

            const { ethers } = await import("ethers");
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();

            // Ensure correct network (BNB Testnet)
            const network = await provider.getNetwork();
            if (network.chainId !== 97n) {
                try {
                    await (window as any).ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x61' }], // 97
                    });
                } catch (switchError: any) {
                    toast.error("Please switch to BNB Testnet");
                    setSubmitting(false);
                    return;
                }
            }

            // 🔐 PHASE 2: Fetch Deterministic Payload from Backend
            const status = confirmDialog.action === "approve" ? "approved" : "rejected";
            const payloadData = await api.getSignaturePayload(
              requestId, 
              status, 
              documentSummary, 
              rejectionReason
            );

            console.log("Signing EIP-712 Payload from Backend:", payloadData.message);
            const signature = await signer.signTypedData(
              payloadData.domain, 
              payloadData.types, 
              payloadData.message
            );

            const finalPayload: any = {
                status,
                signature,
                timestamp: payloadData.message.timestamp.toString()
            };

            if (status === "approved") {
                finalPayload.document_summary = documentSummary;
                finalPayload.notary_notes = documentSummary;
            } else {
                finalPayload.rejection_reason = rejectionReason;
            }

            await api.approveDocument(requestId, finalPayload);

            toast.success(`Request ${status} successfully.`);
            setConfirmDialog({ open: false, action: null });
            setDocumentSummary("");
            setRejectionReason("");
            onBack();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to process request.");
        } finally {
            setSubmitting(false);
        }
    };

    const initiateRemoteSigning = async (status: string) => {
        let pollInterval: any = null;
        try {
            // 1. Fetch Payload
            const payloadData = await api.getSignaturePayload(
                requestId, 
                status, 
                documentSummary, 
                rejectionReason
            );

            // 2. Initiate Remote Session
            const deviceId = await (window as any).electronAPI.api.getDeviceId();
            const configRes = await api.getSystemConfig();
            const session = await api.createRemoteNotarizeSession({
                device_id: deviceId,
                document_id: requestId,
                payload: payloadData
            });

            // 3. Open Remote Auth Portal (External Browser for MetaMask support)
            const baseAuthUrl = configRes.remoteAuthUrl.replace(/\/$/, "");
            const remoteUrl = `${baseAuthUrl}/?mode=notarize&sessionId=${session.sessionId}`;
            await (window as any).electronAPI.api.openExternal(remoteUrl);

            toast.info("Remote Signing Initiated. Please approve the request in your browser.");

            // 4. Poll for status
            pollInterval = setInterval(async () => {
                try {
                    const statusRes = await api.getRemoteSessionStatus(session.sessionId, deviceId, session.sessionSecret);
                    
                    if (statusRes.status === 'authorized' && statusRes.signature) {
                        clearInterval(pollInterval);
                        
                        // 5. Complete approval with captured signature
                        const finalPayload: any = {
                            status,
                            signature: statusRes.signature,
                            timestamp: payloadData.message.timestamp.toString()
                        };

                        if (status === "approved") {
                            finalPayload.document_summary = documentSummary;
                            finalPayload.notary_notes = documentSummary;
                        } else {
                            finalPayload.rejection_reason = rejectionReason;
                        }

                        await api.approveDocument(requestId, finalPayload);
                        toast.success(`Request ${status} successfully (via Remote Auth).`);
                        setConfirmDialog({ open: false, action: null });
                        setDocumentSummary("");
                        setRejectionReason("");
                        onBack();
                    } else if (statusRes.status === 'failed' || statusRes.status === 'expired') {
                        clearInterval(pollInterval);
                        toast.error(`Remote signing ${statusRes.status}.`);
                        setSubmitting(false);
                    }
                } catch (err) {
                    console.error("Polling error:", err);
                }
            }, 3000);

        } catch (err: any) {
            console.error("[REMOTE_SIGN_ERROR]", err);
            toast.error(err.message || "Failed to initiate remote signing.");
            setSubmitting(false);
            if (pollInterval) clearInterval(pollInterval);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!request) return null;

    // Derive file type from filename or mime if available
    const isImage = request.filename.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
    const fileType = isImage ? "Image" : "PDF";

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#07090e] overflow-hidden">
            {/* Header */}
            <div className="flex-none border-b border-border bg-background/95 backdrop-blur-sm z-20 shadow-sm p-4 pt-8 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Button
                                onClick={onBack}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground -ml-2"
                            >
                                <ArrowLeft size={16} className="mr-2" />
                                Back
                            </Button>
                            <h1 className="text-foreground truncate max-w-[500px]" title={request.title || request.filename}>
                                {request.title || request.filename}
                            </h1>
                        </div>
                        <p className="text-sm text-muted-foreground">Document ID: #{request.id} • Review and process notarization request</p>
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30">
                            {request.status}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Split Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Document Viewer */}
                <div className="flex-1 border-r border-border flex flex-col">
                    <div className="border-b border-border bg-card p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {fileType === "PDF" ? (
                                <FileText className="text-blue-600 dark:text-blue-400" size={20} />
                            ) : (
                                <ImageIcon className="text-purple-600 dark:text-purple-400" size={20} />
                            )}
                            <span className="text-muted-foreground">File Type: {fileType} • {request.filename}</span>
                        </div>

                        {fileType === "Image" && (
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setZoom(Math.max(50, zoom - 10))}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <ZoomOut size={16} />
                                </Button>
                                <span className="text-sm text-muted-foreground w-12 text-center">{zoom}%</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setZoom(Math.min(100, zoom + 10))}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <ZoomIn size={16} />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto bg-muted/30 p-8 custom-scrollbar relative" onContextMenu={(e) => e.preventDefault()}>
                        {fileType === "Image" ? (
                            <div className="min-h-full flex items-center justify-center">
                                <div className="relative">
                                    <div
                                        className="bg-background rounded-lg shadow-2xl overflow-hidden transition-all duration-200 mx-auto"
                                        style={{ width: `${(zoom / 100) * 1200}px` }}
                                    >
                                        {/* Real Image or Placeholder */}
                                        {fileUrl ? (
                                            <img
                                                src={fileUrl}
                                                alt="Document"
                                                className="w-full h-auto object-contain pointer-events-none select-none"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = "https://placehold.co/600x800/1a1a1a/FFF?text=Image+Load+Error";
                                                }}
                                            />
                                        ) : (
                                            <div className="w-[600px] h-[800px] bg-muted flex items-center justify-center text-muted-foreground">
                                                Loading Image...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full bg-card rounded-lg shadow-2xl overflow-hidden">
                                {fileUrl ? (
                                    <div className="w-full h-full flex flex-col">
                                        <iframe
                                            src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                            className="flex-1 w-full border-none"
                                            title="Document PDF Viewer"
                                        />
                                        <div className="flex-none p-4 bg-muted/50 border-t border-border flex justify-center">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={async () => {
                                                    const baseUrl = (window as any).electronAPI?.api?.baseUrl || "https://api.bbsns.online";
                                                    // Fetch authoritative session to get raw JWT token
                                                    const session = await (window as any).electronAPI?.auth?.getSession();
                                                    const token = session?.token;
                                                    
                                                    const url = `${baseUrl}/api/documents/${requestId}/file?disposition=inline${token ? `&token=${token}` : ''}`;
                                                    await (window as any).electronAPI?.api?.openExternal(url);
                                                    toast.info("Opening document in system browser.");
                                                }}
                                            >
                                                <ExternalLink size={14} className="mr-2" />
                                                View in Browser
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                                        <Loader2 className="h-8 w-8 animate-spin mr-2" />
                                        Loading PDF...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Information & Actions */}
                <div className="w-96 bg-card flex flex-col border-l border-border h-full overflow-hidden">
                    {/* Scrollable Information Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {/* Client Information */}
                        <div>
                            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <User size={16} className="text-primary" />
                                Client Information
                            </h3>
                            <div className="space-y-2">
                                <div className="bg-muted/50 rounded-xl p-3">
                                    <p className="text-xs text-muted-foreground mb-1">Full Name</p>
                                    <p className="text-sm text-foreground font-medium">{request.owner_name || 'Anonymous User'}</p>
                                </div>
                                <div className="bg-muted/50 rounded-xl p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Email Address</p>
                                    <p className="text-sm text-foreground">{request.owner_email || 'N/A'}</p>
                                </div>
                                <div className="bg-muted/50 rounded-xl p-3">
                                    <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-bold">Wallet Address</p>
                                    <p className="text-sm text-foreground font-mono text-[10px] break-all">{request.owner_wallet}</p>
                                </div>
                            </div>
                        </div>

                        {/* File Hash */}
                        <div className="bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Hash className="text-emerald-700 dark:text-emerald-500" size={14} />
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-500 font-bold uppercase tracking-wider">File Hash Verified</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono break-all leading-tight">{request.file_hash}</p>
                        </div>

                        {/* NTK Balance Card (Newly Added) */}
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Coins className="text-primary" size={16} />
                                <p className="text-xs text-primary font-bold uppercase tracking-wider">Protocol Tokens (NTK)</p>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-black text-foreground">{ntkBalance}</p>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase">NTK Available</p>
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-2 leading-relaxed">
                                Notarization requires 1.0 NTK per document.
                            </p>
                        </div>

                        <div className="bg-muted/50 rounded-xl p-3">
                            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-bold">Created At</p>
                            <p className="text-sm text-foreground">{new Date(request.created_at).toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Sticky Action Footer */}
                    <div className="flex-none p-3 border-t border-border bg-background/80 backdrop-blur-md z-30">
                        {request.status === 'pending' ? (
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleAction("approve")}
                                    disabled={submitting}
                                    variant="default"
                                    className="flex-1 rounded-xl h-10 shadow-lg shadow-primary/20 text-[11px] font-black uppercase tracking-wider"
                                >
                                    <CheckCircle size={14} className="mr-1.5" />
                                    Approve
                                </Button>
                                <Button
                                    onClick={() => handleAction("reject")}
                                    disabled={submitting}
                                    variant="outline"
                                    className="flex-1 border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-xl h-10 text-[11px] font-black uppercase tracking-wider"
                                >
                                    <XCircle size={14} className="mr-1.5" />
                                    Reject
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center">
                                <Badge variant="outline" className="text-muted-foreground border-border w-full justify-center py-2 rounded-xl">
                                    {request.status === 'approved' ? 'Transaction Completed' : 'Transaction Rejected'}
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.open} onOpenChange={(open) => !submitting && setConfirmDialog({ ...confirmDialog, open })}>
                <DialogContent className="bg-card border-border text-foreground max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Confirm {confirmDialog.action === "approve" ? "Approval" : "Rejection"}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {confirmDialog.action === "approve"
                                ? "Please provide a summary of the document contents before approving."
                                : "Please provide a reason for rejecting this document."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Form Fields */}
                    <div className="space-y-4 py-4">
                        {confirmDialog.action === "approve" ? (
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">
                                    Document Summary <span className="text-destructive">*</span>
                                </label>
                                <Textarea
                                    value={documentSummary}
                                    onChange={(e) => setDocumentSummary(e.target.value)}
                                    placeholder="Describe the important contents of this document..."
                                    className="bg-muted/50 border-input text-foreground min-h-[120px]"
                                    disabled={submitting}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    This information will be recorded on the blockchain permanently.
                                </p>
                            </div>
                        ) : (
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">
                                    Rejection Reason <span className="text-red-500">*</span>
                                </label>
                                <Textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Explain why this document is being rejected..."
                                    className="bg-muted/50 border-input text-foreground min-h-[120px]"
                                    disabled={submitting}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    The document owner will see this reason.
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmDialog({ open: false, action: null })}
                            disabled={submitting}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmAction}
                            disabled={submitting}
                            variant={confirmDialog.action === "approve" ? "default" : "destructive"}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                "Confirm"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
