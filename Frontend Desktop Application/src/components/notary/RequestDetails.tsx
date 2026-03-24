import { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, FileText, Image as ImageIcon, User, Wallet, Hash, CheckCircle, XCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { toast } from "sonner";
import api from "../../api";

interface RequestDetailsProps {
    requestId: string;
    onBack: () => void;
}

export function RequestDetails({ requestId, onBack }: RequestDetailsProps) {
    const [zoom, setZoom] = useState(100);
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
            const blob = await api.getDocumentFile(requestId);
            const url = URL.createObjectURL(blob);
            setFileUrl(url);

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

        // Validate required fields
        if (confirmDialog.action === "approve" && !documentSummary.trim()) {
            toast.error("Please provide a document summary");
            return;
        }
        if (confirmDialog.action === "reject" && !rejectionReason.trim()) {
            toast.error("Please provide a rejection reason");
            return;
        }

        setSubmitting(true);
        try {
            // 🔐 EIP-712 SIGNATURE REQUIRED
            if (!window.ethereum) {
                throw new Error("MetaMask is required to sign this action.");
            }

            const { ethers } = await import("ethers");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            // Ensure correct network (BNB Testnet)
            const network = await provider.getNetwork();
            if (network.chainId !== 97n) {
                try {
                    await window.ethereum.request({
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

            await api.updateDocument(requestId, finalPayload);

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

    if (loading) {
        return (
            <div className="flex-1 bg-background flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!request) return null;

    // Derive file type from filename or mime if available
    const isImage = request.filename.match(/\.(jpg|jpeg|png)$/i);
    const fileType = isImage ? "Image" : "PDF";

    return (
        <div className="flex-1 bg-background flex flex-col">
            {/* Header */}
            <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
                <div className="flex items-center justify-between p-6">
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
                            <h1 className="text-foreground">Request Details</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">Review and process notarization request</p>
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-500 dark:border-yellow-500/30">
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
                            <span className="text-muted-foreground">File Type: {fileType}</span>
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
                                    onClick={() => setZoom(Math.min(200, zoom + 10))}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <ZoomIn size={16} />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto bg-muted/30 p-8 flex items-center justify-center">
                        {fileType === "Image" ? (
                            <div className="relative" onContextMenu={(e) => e.preventDefault()}>
                                <div
                                    className="bg-background rounded-lg shadow-2xl overflow-hidden transition-transform duration-200"
                                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center" }}
                                >
                                    {/* Real Image or Placeholder */}
                                    {fileUrl ? (
                                        <img
                                            src={fileUrl}
                                            alt="Document"
                                            className="max-w-[800px] object-contain pointer-events-none select-none"
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
                        ) : (
                            <div className="w-full h-full bg-card rounded-lg shadow-2xl overflow-hidden">
                                {fileUrl ? (
                                    <iframe
                                        src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                        className="w-full h-full min-h-[800px] border-none"
                                        title="Document PDF Viewer"
                                    />
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
                <div className="w-96 bg-card flex flex-col overflow-auto border-l border-border">
                    <div className="p-6 space-y-6">
                        {/* Client Information */}
                        <div>
                            <h3 className="text-foreground mb-4 flex items-center gap-2">
                                <User size={18} className="text-primary" />
                                Client Information
                            </h3>
                            <div className="space-y-3">
                                <div className="bg-muted/50 rounded-xl p-4">
                                    <p className="text-xs text-muted-foreground mb-1">User ID</p>
                                    <p className="text-sm text-foreground font-mono">{request.user_id}</p>
                                </div>
                            </div>
                        </div>

                        {/* File Hash */}
                        <div className="bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Hash className="text-emerald-700 dark:text-emerald-500" size={16} />
                                <p className="text-xs text-emerald-700 dark:text-emerald-500">File Hash Generated</p>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono break-all">{request.file_hash}</p>
                        </div>

                        <div className="bg-muted/50 rounded-xl p-4">
                            <p className="text-xs text-muted-foreground mb-1">Created At</p>
                            <p className="text-sm text-foreground">{new Date(request.created_at).toLocaleString()}</p>
                        </div>

                        {/* Action Buttons */}
                        {request.status === 'pending' ? (
                            <div className="space-y-3 pt-4">
                                <Button
                                    onClick={() => handleAction("approve")}
                                    disabled={submitting}
                                    variant="default"
                                    className="w-full rounded-xl h-11"
                                >
                                    <CheckCircle size={16} className="mr-2" />
                                    Approve Request
                                </Button>
                                <Button
                                    onClick={() => handleAction("reject")}
                                    disabled={submitting}
                                    variant="outline"
                                    className="w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-500/50 dark:text-red-500 dark:hover:bg-red-500/10 rounded-xl h-11"
                                >
                                    <XCircle size={16} className="mr-2" />
                                    Reject Request
                                </Button>
                            </div>
                        ) : (
                            <div className="pt-4 text-center">
                                <Badge variant="outline" className="text-muted-foreground border-border">
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
