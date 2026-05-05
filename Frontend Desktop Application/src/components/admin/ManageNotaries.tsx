import { useState, useEffect } from "react";
import { Search, Filter, UserCheck, UserX, Eye, CheckCircle, ShieldAlert, RotateCw, ShieldCheck, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { toast } from "sonner";
import api from "../../services/api";
import { normalizeStatus, getDisplayStatus } from "../../utils/status";


function unwrapResponse(res: any) {
  if (res?.status === "ok" && Array.isArray(res.data)) {
    return res.data;
  }
  console.error("CONTRACT_VIOLATION:", res);
  throw new Error("Invalid API contract");
}

export function ManageNotaries() {
  const [applications, setApplications] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: "",
    application: null as any | null,
  });
  const [viewDialog, setViewDialog] = useState({
    open: false,
    application: null as any | null,
  });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [onChainStatuses, setOnChainStatuses] = useState<Record<string, boolean>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  const [promotionDialog, setPromotionDialog] = useState({
    open: false,
    application: null as any | null,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ===============================
  // BLOCKCHAIN AUDIT LOGIC
  // ===============================
  const auditOnChainStatus = async (apps: any[]) => {
    setIsAuditing(true);
    const statuses: Record<string, boolean> = {};
    
    // Audit in parallel with rate control
    const auditPromises = apps
      .filter(app => app.wallet_address)
      .map(async (app) => {
        try {
          const res = await api.getOnChainRole(app.wallet_address);
          statuses[app.wallet_address.toLowerCase()] = res.data.isOnChain;
        } catch (err) {
          console.warn(`[AUDIT_FAIL] ${app.wallet_address}:`, err);
          statuses[app.wallet_address.toLowerCase()] = false;
        }
      });

    await Promise.all(auditPromises);
    setOnChainStatuses(prev => ({ ...prev, ...statuses }));
    setIsAuditing(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  // ===============================
  // LOAD DATA
  // ===============================
  const loadApplications = async () => {
    try {
      const [applicationsRes, activeNotariesRes] = await Promise.all([
        api.getNotaryApplications(),
        api.getNotaries()
      ]);

      console.log("RAW APPLICATION RESPONSE:", applicationsRes);
      
      const applicationsArray = unwrapResponse(applicationsRes).map((app: any) => ({
        ...app,
        id: app.application_id || app.id,
        status: normalizeStatus(app.status || 'PENDING')
      }));
      
      const activeNotaries = unwrapResponse(activeNotariesRes).map((notary: any) => ({
        ...notary,
        status: normalizeStatus(notary.status || 'ACTIVATED')
      }));

      const merged = [...applicationsArray];

      activeNotaries.forEach((notary: any) => {
        const wallet = (notary.wallet_address || "").toLowerCase();
        const existing = merged.find(a =>
          (a.wallet_address || "").toLowerCase() === wallet
        );

        if (!existing) {
          merged.push({ ...notary, status: "ACTIVATED" });
        } else {
          existing.id = existing.id || notary.id;
          if (notary.role === "notary") {
            existing.status = "ACTIVATED";
          }
        }
      });

      setApplications(merged);
      setSyncError(null);
      
      // 🛡️ [AUDIT_SYNC] Trigger Real-time Blockchain Pulse
      auditOnChainStatus(merged);
    } catch (err: any) {
      console.error("[NOTARIES_LOAD_FAIL]", err);
      setSyncError("Data sync error — invalid response format");
      toast.error(err.message || "Failed to load applications");
      setApplications([]); 
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // ===============================
  // FILTER LOGIC
  // ===============================
  const visibleStatuses = ["PENDING", "KYC_VERIFIED", "APPROVED", "REJECTED", "ACTIVATED"];

  const filteredApplications = (Array.isArray(applications) ? applications : []).filter((app) => {
    if (!app) return false;
    const status = normalizeStatus(app.status);


    if (!visibleStatuses.includes(status)) return false;

    const matchesSearch =
      (app.name || app.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.license_number || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === "all" ||
      status === filterStatus.toUpperCase();

    return matchesSearch && matchesFilter;
  });

  // ===============================
  // ACTION HANDLERS
  // ===============================
  const handleAction = (action: string, application: any) => {
    setConfirmDialog({ open: true, action, application });
  };

  const confirmAction = async () => {
    if (!confirmDialog.application) return;

    try {
      const targetId = confirmDialog.application.id || confirmDialog.application.application_id;
      const targetApp = confirmDialog.application;
      console.log(`[NOTARY_ACTION_TRACE] Initiating ${confirmDialog.action} for target: ${targetId}`, targetApp);

      if (confirmDialog.action === "approve") {
        await api.approveNotaryApplication(targetId);
        toast.success("Application approved in database");
        
        // 🛡️ [GOVERNANCE_SYNC] Trigger On-Chain Promotion Dialog
        setPromotionDialog({
          open: true,
          application: targetApp
        });
      } else {
        await api.rejectNotaryApplication(targetId);
        toast.success("Application rejected");
      }

      await loadApplications();
    } catch (err: any) {
      if (err.message?.includes("ALREADY_PROCESSED") || err.message?.includes("409")) {
        toast.info("This application has already been processed.");
      } else {
        toast.error(err.message || "Operation failed");
      }
    } finally {
      setConfirmDialog({ open: false, action: "", application: null });
    }
  };

  const handlePromoteOnChain = async (app: any) => {
    try {
      const config = await api.getSystemConfig();
      const baseAuthUrl = config.remoteAuthUrl.replace(/\/$/, "");
      const remoteUrl = `${baseAuthUrl}/?mode=promote&targetAddress=${app.wallet_address}`;
      
      // @ts-ignore
      if (window.electronAPI) {
        // @ts-ignore
        window.electronAPI.openExternal(remoteUrl);
      } else {
        window.open(remoteUrl, "_blank");
      }
      toast.info("Promotion portal opened in external browser.");
    } catch (err: any) {
      toast.error("Failed to fetch system configuration.");
    }
  };


  const openView = (app: any) => {
    setViewDialog({ open: true, application: app });
  };
  
  const handleResend = async (app: any) => {
    try {
      await api.resendNotaryActivation(app.application_id || app.id);
      toast.success("Activation email resent successfully.");
      await loadApplications();
    } catch (err: any) {
      toast.error(err.message || "Failed to resend activation email.");
    }
  };

  // ===============================
  // STATUS BADGE (NO DEFAULT PENDING)
  // ===============================
  const getStatusBadge = (status: string | undefined | null) => {
    if (!status) return null;

    const variants: Record<string, string> = {
      APPROVED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      ACTIVATED: "bg-emerald-600/10 text-emerald-600 border-emerald-600/20",
      REJECTED: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      KYC_VERIFIED: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    };

    const s = normalizeStatus(status);

    return (
      <Badge className={`${variants[s] || variants.PENDING} border`}>
        {getDisplayStatus(s)}
      </Badge>

    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background overflow-hidden">
      <div className="flex-none p-8 pt-12 pb-8 border-b border-border/50 bg-background">
        <h1 className="text-4xl font-black text-foreground italic tracking-tighter uppercase leading-none mb-3">NOTARY MANAGEMENT</h1>
        <p className="text-sm text-slate-400 font-medium italic">
          Review and approve verification requests within the administrative vault
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="p-8 pb-32">

      {syncError && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-500 text-sm font-bold animate-pulse">
          <ShieldAlert size={18} />
          {syncError}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <Input
              placeholder="Search by name or License ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 bg-muted/50 border-border/50 text-foreground rounded-xl h-12 w-full focus:border-primary/50"
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-56 bg-muted/50 border-border/50 text-foreground rounded-xl h-12">
              <Filter size={16} className="mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1425] border-white/10 text-white">
              <SelectItem value="all">ALL STATUS</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="KYC_VERIFIED">VERIFIED</SelectItem>
              <SelectItem value="APPROVED">APPROVED</SelectItem>
              <SelectItem value="ACTIVATED">ACTIVE NOTARIES</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-[#0d1425] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <Table>
            <TableHeader className="bg-white/5">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-8">Name</TableHead>
                <TableHead className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">License No.</TableHead>
                <TableHead className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</TableHead>
                <TableHead className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</TableHead>
                <TableHead className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredApplications.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-32">
                    <div className="flex flex-col items-center justify-center space-y-4 opacity-40">
                       <ShieldAlert size={64} strokeWidth={1} className="text-slate-500" />
                       <div className="text-center">
                         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No applications found</p>
                         <p className="text-[9px] text-slate-600 mt-1">The administrative vault is currently clear.</p>
                       </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredApplications.map((app) => {
                  const status = normalizeStatus(app.status);
                  const canAdminAct = status === "KYC_VERIFIED";


                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.name || app.full_name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {app.license_number}
                      </TableCell>
                      <TableCell className="text-sm">{app.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(app.status)}
                          {app.wallet_address && (status.toUpperCase() === 'APPROVED' || status.toUpperCase() === 'ACTIVATED') && (
                            onChainStatuses[app.wallet_address.toLowerCase()] ? (
                              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" title="On-Chain Verified" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" title="Missing On-Chain (Action Required)" />
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openView(app)}
                            className="text-primary hover:bg-primary/20"
                          >
                            <Eye size={14} className="mr-1" />
                            View
                          </Button>

                          {canAdminAct && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleAction("approve", app)}
                                className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                              >
                                <UserCheck size={14} className="mr-1" />
                                Approve
                              </Button>

                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleAction("reject", app)}
                                className="bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30"
                              >
                                <UserX size={14} className="mr-1" />
                                Reject
                              </Button>
                            </>
                          )}

                          {status === "approved" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePromoteOnChain(app)}
                                className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                              >
                                <ShieldCheck size={14} className="mr-1" />
                                Promote On-Chain
                              </Button>


                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResend(app)}
                                className="text-amber-500 hover:bg-amber-500/10"
                              >
                                <RotateCw size={14} className="mr-1" />
                                Resend
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Confirm {confirmDialog.action === "approve" ? "Approval" : "Rejection"}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to {confirmDialog.action} the application for {" "}
              <span className="text-primary">{confirmDialog.application?.name || confirmDialog.application?.full_name}</span>?
              {confirmDialog.action === "approve" && " This will create a verified Notary account and enable access."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDialog({ open: false, action: "", application: null })}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              className={
                confirmDialog.action === "approve"
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog({ ...viewDialog, open })}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Review full profile and verification data for this notary.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Applicant Name</h4>
                <p className="text-foreground font-medium">{viewDialog.application?.name || viewDialog.application?.full_name}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">License Number</h4>
                <p className="font-mono text-primary">{viewDialog.application?.license_number || "Not provided"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Email Address</h4>
                <p className="text-foreground">{viewDialog.application?.email || "Not provided"}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Phone</h4>
                <p className="text-foreground">{viewDialog.application?.phone || "Not provided"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Nationality</h4>
                <p className="text-foreground">{viewDialog.application?.nationality || "Not specified"}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">National ID</h4>
                <p className="text-foreground font-mono">{viewDialog.application?.national_id || "Not provided"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Status & Verification</h4>
              <div className="flex items-center gap-3">
                {getStatusBadge(viewDialog.application?.status)}
                {viewDialog.application?.status === 'KYC_VERIFIED' && (

                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                    <CheckCircle size={14} /> Identity Integrity Verified by System
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Experience & Qualifications</h4>
              <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border text-sm leading-relaxed whitespace-pre-wrap">
                {viewDialog.application?.experience || "No details provided."}
              </div>
            </div>

            <div className="pt-2">
              <h4 className="text-sm font-medium text-muted-foreground">On-Chain Linkage</h4>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-muted-foreground truncate bg-muted p-2 rounded font-mono flex-1">
                  {viewDialog.application?.wallet_address}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/20 text-muted-foreground hover:text-primary relative"
                  onClick={() => handleCopy(viewDialog.application?.wallet_address, 'view-wallet')}
                >
                  <FileText className="h-4 w-4" />
                  {copiedId === 'view-wallet' && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded shadow-lg z-50 animate-in fade-in zoom-in duration-200">
                      COPIED!
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
          {/* 🛡️ [ACTION_BRIDGE] Bunker V3.6.1: Integrated Modal Control */}
          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-border/50">
            {viewDialog.application?.status === 'KYC_VERIFIED' && (

              <div className="flex gap-2 w-full justify-end">
                <Button 
                  onClick={() => {
                    setViewDialog({ ...viewDialog, open: false });
                    handleAction("reject", viewDialog.application);
                  }}
                  variant="destructive"
                  className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 px-6 font-bold uppercase text-[10px] tracking-tighter"
                >
                  <UserX size={14} className="mr-2" />
                  Reject Application
                </Button>
                <Button 
                  onClick={() => {
                    setViewDialog({ ...viewDialog, open: false });
                    handleAction("approve", viewDialog.application);
                  }}
                  className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 px-6 font-bold uppercase text-[10px] tracking-tighter"
                >
                  <UserCheck size={14} className="mr-2" />
                  Approve Notary
                </Button>
              </div>
            )}
            <Button 
              variant="ghost" 
              onClick={() => setViewDialog({ ...viewDialog, open: false })}
              className="text-[10px] font-bold uppercase tracking-widest text-slate-500"
            >
              Close Profile
            </Button>
            
            {viewDialog.application?.wallet_address && 
             (normalizeStatus(viewDialog.application.status) === 'APPROVED' || normalizeStatus(viewDialog.application.status) === 'ACTIVATED') && 
             !onChainStatuses[viewDialog.application.wallet_address.toLowerCase()] && (
              <Button 
                onClick={() => {
                  handlePromoteOnChain(viewDialog.application);
                }}
                className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 px-6 font-bold uppercase text-[10px] tracking-tighter animate-pulse ml-auto"
              >
                <ShieldAlert size={14} className="mr-2" />
                Promote to On-chain (Sync Required)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Governance Promotion Dialog (Post-Approval) */}
      <Dialog open={promotionDialog.open} onOpenChange={(open) => setPromotionDialog({ ...promotionDialog, open })}>
        <DialogContent className="bg-[#0d1425] border-emerald-500/30 text-white max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                <ShieldCheck size={40} className="text-emerald-500" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl font-black italic tracking-tighter uppercase">Governance Sync Required</DialogTitle>
            <DialogDescription className="text-center text-slate-400">
              The application for <span className="text-emerald-400 font-bold">{promotionDialog.application?.name || promotionDialog.application?.full_name}</span> has been approved in the database.
              <br/><br/>
              To officially authorize this Notary on the <span className="text-white font-bold">BNB Testnet</span>, you must perform an on-chain promotion.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
             <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2 relative group">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Wallet to Promote</p>
                  <button 
                    onClick={() => handleCopy(promotionDialog.application?.wallet_address, 'promo-wallet')}
                    className="text-slate-500 hover:text-emerald-400 p-1 relative"
                  >
                    <FileText size={12} />
                    {copiedId === 'promo-wallet' && (
                      <span className="absolute bottom-full right-0 mb-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded shadow-lg z-50 animate-in fade-in zoom-in duration-200">
                        COPIED!
                      </span>
                    )}
                  </button>
                </div>
                <code className="text-xs text-emerald-500 block truncate font-mono">
                  {promotionDialog.application?.wallet_address}
                </code>
             </div>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              onClick={() => {
                handlePromoteOnChain(promotionDialog.application);
                setPromotionDialog({ open: false, application: null });
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-primary-foreground font-black uppercase italic tracking-tighter"
            >
              <ShieldCheck size={16} className="mr-2" />
              Finalize on Blockchain
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPromotionDialog({ open: false, application: null })}
              className="w-full text-slate-500 hover:text-white"
            >
              I'll Sync Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
  );
}

