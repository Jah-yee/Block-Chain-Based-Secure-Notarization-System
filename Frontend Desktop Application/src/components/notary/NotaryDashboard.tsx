import { FileText, CheckCircle, XCircle, Eye, RefreshCw, Loader2, Coins, Plus, Gavel } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import api from "../../api";

interface NotaryDashboardProps {
    onViewRequest: (requestId: string | number) => void;
    filterStatus?: "pending" | "approved" | "rejected";
}

interface Document {
    id: number;
    filename: string;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    file_hash: string;
    ntkr_sent: number;
}

export function NotaryDashboard({ onViewRequest, filterStatus }: NotaryDashboardProps) {
    const [requests, setRequests] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [ntkBalance, setNtkBalance] = useState<string>("0.0");
    const [userWallet, setUserWallet] = useState<string>("");

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError("");
        try {
            const [docs, user] = await Promise.all([
                api.getDocuments(),
                api.getMe()
            ]);

            setRequests(docs);
            setUserWallet(user.wallet_address);

            // Fetch live NTK balance
            if (user.wallet_address) {
                const balRes = await api.getOnChainBalance(user.wallet_address, 'ntk');
                setNtkBalance(balRes.balance);
            }
        } catch (err: any) {
            console.error(err);
            const msg = err.message || "Failed to load dashboard data.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddTokenToWallet = async () => {
        if (!window.ethereum) {
            toast.error("MetaMask not found.");
            return;
        }
        try {
            // NTK Address (Standardizing on the ENV set)
            const NTK_ADDRESS = "0x505388A24BA31F64A46dC10a7923EA4892c0B0C7";
            await window.ethereum.request({
                method: 'wallet_watchAsset',
                params: {
                    type: 'ERC20',
                    options: {
                        address: NTK_ADDRESS,
                        symbol: 'NTK',
                        decimals: 18,
                    },
                },
            });
            toast.success("NTK Token added to wallet.");
        } catch (error) {
            console.error(error);
        }
    };

    const stats = [
        {
            label: "Pending Requests",
            value: requests.filter(r => r.status === "pending").length,
            icon: FileText,
            color: "yellow",
        },
        {
            label: "Approved",
            value: requests.filter(r => r.status === "approved").length,
            icon: CheckCircle,
            color: "emerald",
        },
        {
            label: "Rejected",
            value: requests.filter(r => r.status === "rejected").length,
            icon: XCircle,
            color: "red",
        },
        {
            label: "NTK Balance",
            value: ntkBalance,
            icon: Coins,
            color: "primary",
            action: {
                label: "Add to Wallet",
                icon: Plus,
                onClick: handleAddTokenToWallet
            }
        }
    ];

    const getStatusBadge = (status: string) => {
        const variants = {
            pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30",
            approved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
            rejected: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
        };
        return (
            <Badge className={`${variants[status as keyof typeof variants] || "bg-muted text-muted-foreground border-border"} border capitalize`}>
                {status}
            </Badge>
        );
    };

    // Filter requests based on prop
    const displayedRequests = filterStatus
        ? requests.filter(r => r.status === filterStatus)
        : requests;

    return (
        <div className="flex-1 bg-background overflow-auto">
            {/* Header */}
            <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-foreground mb-1">
                            {filterStatus ? `${filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} Requests` : "Notary Dashboard"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {filterStatus ? `Viewing all ${filterStatus} notarization requests` : "Welcome back, review and process notarization requests"}
                        </p>
                    </div>
                    <Button
                        onClick={fetchData}
                        disabled={isLoading}
                        variant="outline"
                        className="border-border text-muted-foreground hover:bg-muted"
                    >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
                {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/50 rounded-xl text-destructive text-sm">
                        {error}
                    </div>
                )}

                {/* Stats Grid - Show only on main dashboard */}
                {!filterStatus && (
                    <div className="grid grid-cols-3 gap-6">
                        {stats.map((stat) => {
                            const Icon = stat.icon;
                            // Keeping specific colors for stats as they are semantic status indicators
                            const colorMap = {
                                yellow: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30",
                                emerald: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
                                red: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
                            };

                            return (
                                <Card
                                    key={stat.label}
                                    className="bg-card/50 border-border rounded-xl p-6 hover:shadow-lg hover:shadow-primary/10 transition-all"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${stat.color === 'primary' ? 'bg-primary/10 text-primary border-primary/20' : colorMap[stat.color as keyof typeof colorMap]}`}>
                                            <Icon size={24} />
                                        </div>
                                        {stat.action && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-primary hover:bg-primary/10"
                                                onClick={stat.action.onClick}
                                            >
                                                <stat.action.icon size={14} className="mr-1" />
                                                {stat.action.label}
                                            </Button>
                                        )}
                                    </div>
                                    <h2 className="text-foreground mb-1">{stat.value}</h2>
                                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Requests Table */}
                <Card className="bg-card/50 border-border rounded-xl p-6">
                    <h3 className="text-foreground mb-4">
                        {filterStatus ? "Requests List" : "Recent Requests"}
                    </h3>

                    <div className="border border-border rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="text-muted-foreground">Request ID</TableHead>
                                    <TableHead className="text-muted-foreground">File Type</TableHead>
                                    <TableHead className="text-muted-foreground">Hash</TableHead>
                                    <TableHead className="text-muted-foreground">Status</TableHead>
                                    <TableHead className="text-muted-foreground">Date</TableHead>
                                    <TableHead className="text-muted-foreground text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : displayedRequests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                            No {filterStatus || ""} requests found.
                                        </TableCell>
                                    </TableRow>
                                ) : displayedRequests.map((request) => (
                                    <TableRow key={request.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="text-foreground font-mono text-xs">{String(request.id).substring(0, 8)}...</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-primary" />
                                                <span className="text-muted-foreground">Document</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-xs">{request.file_hash.substring(0, 16)}...</TableCell>
                                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{new Date(request.created_at).toLocaleString()}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                onClick={() => onViewRequest(request.id)}
                                                className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg"
                                            >
                                                <Eye size={14} className="mr-1" />
                                                View/Action
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </div>
        </div>
    );
}
