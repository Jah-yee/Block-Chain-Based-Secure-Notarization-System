import { useState, useEffect } from "react";
import { FileText, Calendar, Hash, Eye, CheckCircle, XCircle, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { toast } from "sonner";
import api from "../../services/api";
import { DocumentMetadata } from "./DocumentMetadata";

export function UserDashboard() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDocument, setSelectedDocument] = useState<any>(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const docs = await api.getDocuments();
            // 🛡️ [SECURITY] Hardened array access to prevent renderer crash
            setDocuments(Array.isArray(docs) ? docs : []);
        } catch (err: any) {
            console.error("[USER_DASH_FAIL]", err);
            toast.error("Failed to load documents");
            setDocuments([]); // 🛡️ Maintain stable state on failure
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <CheckCircle size={14} className="mr-1" />
                        Approved
                    </Badge>
                );
            case 'rejected':
                return (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                        <XCircle size={14} className="mr-1" />
                        Rejected
                    </Badge>
                );
            default:
                return (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        <Clock size={14} className="mr-1" />
                        Pending
                    </Badge>
                );
        }
    };

    if (loading) {
        return (
            <div className="flex-1 bg-background flex items-center justify-center">
                <div className="text-muted-foreground">Loading documents...</div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#07090e]">
            {/* Header */}
            <div className="flex-none border-b border-border bg-card/50 p-8 pt-12 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">My Documents</h1>
                    <p className="text-muted-foreground">View and manage your uploaded documents</p>
                </div>
            </div>

            {/* Documents Table */}
            <div className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar">
                {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <FileText size={48} className="mb-4 opacity-50" />
                        <p>No documents uploaded yet</p>
                    </div>
                ) : (
                    <div className="bg-card/50 rounded-xl border border-border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="text-muted-foreground">Filename</TableHead>
                                    <TableHead className="text-muted-foreground">Uploaded</TableHead>
                                    <TableHead className="text-muted-foreground">File Hash</TableHead>
                                    <TableHead className="text-muted-foreground">Status</TableHead>
                                    <TableHead className="text-muted-foreground">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {documents.map((doc) => (
                                    <TableRow key={doc.id} className="border-border hover:bg-muted/50">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-blue-500" />
                                                <span className="text-foreground">{doc.filename}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                                <Calendar size={14} />
                                                {new Date(doc.created_at).toLocaleString()}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Hash size={14} className="text-emerald-500" />
                                                <span className="text-muted-foreground font-mono text-xs selectable">
                                                    {(doc.file_hash || "0x...").substring(0, 16)}...
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setSelectedDocument(doc)}
                                                className="border-border text-foreground hover:bg-muted"
                                            >
                                                <Eye size={14} className="mr-2" />
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {/* Document Metadata Modal */}
            {selectedDocument && (
                <DocumentMetadata
                    document={selectedDocument}
                    onClose={() => setSelectedDocument(null)}
                />
            )}
        </div>
    );
}
