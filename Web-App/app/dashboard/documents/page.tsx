"use client";

import { useState, useEffect } from "react";
import { FileText, Calendar, Hash, Eye, CheckCircle, XCircle, Clock, ExternalLink, Download } from "lucide-react";
import { apiClient } from "@/lib/api-client"
import { toast } from "sonner";
import { generateCertificatePDF } from "@/lib/pdf-utils";

interface Document {
    id: number;
    filename: string;
    title: string;
    file_hash: string;
    status: string;
    created_at: string;
    updated_at: string;
    approval_tx_hash?: string;
    burn_tx_hash?: string;
    document_summary?: string;
    rejection_reason?: string;
    notary_id?: number;
    notary_wallet?: string;
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get('/api/documents')
            setDocuments(data || [])
        } catch (err: any) {
            console.error(err);
            toast.error("Failed to load documents");
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "approved":
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm">
                        <CheckCircle size={14} />
                        Approved
                    </span>
                );
            case "rejected":
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-sm">
                        <XCircle size={14} />
                        Rejected
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm">
                        <Clock size={14} />
                        Pending
                    </span>
                );
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-400">Loading documents...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0D1B2A] p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-100 mb-2">My Documents</h1>
                    <p className="text-gray-400">View and manage your uploaded documents</p>
                </div>

                {/* Documents Grid */}
                {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <FileText size={64} className="mb-4 opacity-50" />
                        <p className="text-lg">No documents uploaded yet</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className="bg-[#0A2540] border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-3">
                                            <FileText className="text-blue-400" size={20} />
                                            <h3 className="text-lg font-semibold text-gray-100">{doc.title || doc.filename}</h3>
                                            {getStatusBadge(doc.status)}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Uploaded</p>
                                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                                    <Calendar size={14} />
                                                    {new Date(doc.created_at).toLocaleString()}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">File Hash</p>
                                                <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
                                                    <Hash size={14} className="text-emerald-400" />
                                                    {doc.file_hash.substring(0, 20)}...
                                                </div>
                                            </div>
                                        </div>

                                        {doc.burn_tx_hash && (
                                            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-orange-400 mb-1">Token Burn Transaction</p>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs text-gray-300 font-mono break-all">
                                                        {doc.burn_tx_hash}
                                                    </p>
                                                    <a
                                                        href={`https://testnet.bscscan.com/tx/${doc.burn_tx_hash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="ml-2 text-orange-400 hover:text-orange-300 flex items-center gap-1 text-xs whitespace-nowrap"
                                                    >
                                                        View <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                            </div>
                                        )}

                                        {doc.approval_tx_hash && (
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-emerald-400 mb-1">Notarization Transaction</p>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs text-gray-300 font-mono break-all">
                                                        {doc.approval_tx_hash}
                                                    </p>
                                                    <a
                                                        href={`https://testnet.bscscan.com/tx/${doc.approval_tx_hash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="ml-2 text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-xs whitespace-nowrap"
                                                    >
                                                        View <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                            </div>
                                        )}

                                        {doc.document_summary && (
                                            <div className="bg-gray-900/50 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-gray-400 mb-1">Document Summary</p>
                                                <p className="text-sm text-gray-300">{doc.document_summary}</p>
                                            </div>
                                        )}

                                        {doc.rejection_reason && (
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-red-400 mb-1">Rejection Reason</p>
                                                <p className="text-sm text-gray-300">{doc.rejection_reason}</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setSelectedDocument(doc)}
                                        className="ml-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg flex items-center gap-2 transition-colors"
                                    >
                                        <Eye size={16} />
                                        Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Document Details Modal */}
            {selectedDocument && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={() => {
                      setSelectedDocument(null);
                      setPreviewUrl(null);
                    }}
                >
                    <div
                        className="bg-[#0A2540] border border-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-gray-100">Document Details</h2>
                            {/* A11y Fix: Screen reader title */}
                            <span className="sr-only">Document Preview and Metadata</span>
                            <button
                                onClick={() => {
                                  setSelectedDocument(null);
                                  setPreviewUrl(null);
                                }}
                                className="text-gray-400 hover:text-gray-200"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-sm text-gray-400 mb-1">Title</p>
                                <p className="text-gray-200">{selectedDocument.title || selectedDocument.filename}</p>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-sm text-gray-500 mb-1">Technical Filename</p>
                                <p className="text-sm text-gray-400 font-mono">{selectedDocument.filename}</p>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-sm text-gray-400 mb-1">File Hash</p>
                                <p className="text-xs text-gray-300 font-mono break-all">
                                    {selectedDocument.file_hash}
                                </p>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-4">
                                <p className="text-sm text-gray-400 mb-2">Status</p>
                                {getStatusBadge(selectedDocument.status)}
                            </div>

                            {selectedDocument.approval_tx_hash && (
                                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                                    <p className="text-sm text-emerald-400 mb-2">Blockchain Transaction</p>
                                    <p className="text-xs text-gray-300 font-mono break-all mb-3">
                                        {selectedDocument.approval_tx_hash}
                                    </p>
                                    <a
                                        href={`https://testnet.bscscan.com/tx/${selectedDocument.approval_tx_hash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
                                    >
                                        View on BSCScan
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            )}

                            {selectedDocument.status === "approved" && (
                                <div className="flex justify-center pt-2 pb-2">
                                    <button
                                        onClick={async () => {
                                            try {
                                                toast.info("Generating certificate...")
                                                
                                                // Extract Owner Wallet from stored user data if available
                                                let ownerWalletStr = "Owner Wallet (Redacted)"
                                                try {
                                                    const storedUser = localStorage.getItem('bbsns_user')
                                                    if (storedUser) {
                                                        const parsed = JSON.parse(storedUser)
                                                        if (parsed.wallet_address) {
                                                            ownerWalletStr = parsed.wallet_address
                                                        }
                                                    }
                                                } catch (e) {
                                                    // ignore parse errors
                                                }

                                                await generateCertificatePDF({
                                                    filename: selectedDocument.filename,
                                                    fileHash: selectedDocument.file_hash,
                                                    status: selectedDocument.status,
                                                    txHash: selectedDocument.approval_tx_hash || "",
                                                    notaryWallet: selectedDocument.notary_wallet || "0xNotary... (Redacted by request)",
                                                    ownerWallet: ownerWalletStr,
                                                    timestamp: selectedDocument.updated_at,
                                                    documentSummary: selectedDocument.document_summary
                                                })
                                                toast.success("Certificate downloaded successfully!")
                                            } catch (err) {
                                                console.error(err)
                                                toast.error("Failed to generate PDF certificate")
                                            }
                                        }}
                                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-medium border border-emerald-500"
                                    >
                                        <Download size={18} />
                                        Download Official Receipt
                                    </button>
                                </div>
                            )}

                            {selectedDocument.document_summary && (
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <p className="text-sm text-gray-400 mb-2">Document Summary</p>
                                    <p className="text-gray-300 whitespace-pre-wrap">
                                        {selectedDocument.document_summary}
                                    </p>
                                </div>
                            )}
                            {/* Hardened Phase 3: Iframe Preview Integration */}
                            {previewUrl ? (
                              <div className="mt-4 border border-gray-700 rounded-lg overflow-hidden bg-white/5 h-[400px]">
                                <iframe 
                                  src={previewUrl} 
                                  className="w-full h-full border-none" 
                                  title="Document Preview"
                                  onError={() => toast.error("Browser blocked preview or insecure content.")}
                                />
                              </div>
                            ) : (
                              <div className="flex justify-center pt-2">
                                <button
                                    onClick={async () => {
                                        setIsPreviewLoading(true);
                                        try {
                                            const response = await apiClient.get<{ preview_url: string }>(`/api/documents/${selectedDocument.id}/preview`);
                                            setPreviewUrl(response.preview_url);
                                            toast.success("Preview loaded");
                                        } catch (e) {
                                            toast.error("Failed to fetch preview link.");
                                        } finally {
                                            setIsPreviewLoading(false);
                                        }
                                    }}
                                    disabled={isPreviewLoading}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-center gap-2 transition-colors font-medium disabled:opacity-50"
                                >
                                    {isPreviewLoading ? (
                                      <span className="animate-spin text-xl">◌</span>
                                    ) : (
                                      <Eye size={18} />
                                    )}
                                    {isPreviewLoading ? "Generating..." : "Preview Document Content"}
                                </button>
                              </div>
                            )}


                            {selectedDocument.rejection_reason && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                                    <p className="text-sm text-red-400 mb-2">Rejection Reason</p>
                                    <p className="text-gray-300 whitespace-pre-wrap">
                                        {selectedDocument.rejection_reason}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <p className="text-xs text-gray-400 mb-1">Created</p>
                                    <p className="text-sm text-gray-300">
                                        {new Date(selectedDocument.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-gray-900/50 rounded-lg p-4">
                                    <p className="text-xs text-gray-400 mb-1">Updated</p>
                                    <p className="text-sm text-gray-300">
                                        {new Date(selectedDocument.updated_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
