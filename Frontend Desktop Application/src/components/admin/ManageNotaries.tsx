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
import { ethers } from "ethers";
import { useConfig } from "../../contexts/ConfigAuthority";


function unwrapResponse(res: any) {
  if (!res) return res;

  // If it's already an array, perfect.
  if (Array.isArray(res)) return res;

  if (typeof res === 'object') {
    // Standard BBSNS Wrapper: { status: "ok", data: [...] }
    if (res.status === "ok" && res.data !== undefined) return res.data;

    // Electron Bridge Wrapper (sometimes double-wrapped): { success: true, data: [...] }
    if (res.success === true && res.data !== undefined) return res.data;

    // If it has data but no status, it's likely the payload
    if (res.data !== undefined && res.status === undefined) return res.data;

    // If it's just an object, return it (e.g., multisig settings)
    return res;
  }

  return res;
}

export function ManageNotaries() {
  const { config } = useConfig();
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
  const [activeProposals, setActiveProposals] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<{ threshold: number; signers: string[] } | null>(null);
  const [inFlightPromotions, setInFlightPromotions] = useState<Record<string, boolean>>({});

  // ===============================
  // BLOCKCHAIN AUDIT LOGIC
  // ===============================
  const auditOnChainStatus = async (apps: any[]) => {
    console.log("🔍 [AUDIT_START] Checking blockchain status for", apps.length, "notaries...");
    setIsAuditing(true);
    const statuses: Record<string, boolean> = {};

    // Audit in parallel with rate control
    const auditPromises = apps
      .filter(app => app.wallet_address)
      .map(async (app) => {
        try {
          const res = await api.getOnChainRole(app.wallet_address);
          console.log(`📡 [AUDIT_RESULT] ${app.wallet_address}:`, res.data.isOnChain ? "Verified ✅" : "Missing ❌");
          statuses[app.wallet_address.toLowerCase()] = res.data.isOnChain;
        } catch (err) {
          console.error(`❌ [AUDIT_ERROR] Failed for ${app.wallet_address}:`, err);
          statuses[app.wallet_address.toLowerCase()] = false;
        }
      });

    await Promise.all(auditPromises);
    console.log("🏁 [AUDIT_COMPLETE] Final Statuses:", statuses);
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
      const [applicationsRes, activeNotariesRes, proposalsRes, multisigSettingsRes] = await Promise.all([
        api.getNotaryApplications(),
        api.getNotaries(),
        api.getProposals(),
        api.getMultisigSettings()
      ]);

      const appsData = unwrapResponse(applicationsRes);
      const apps = (Array.isArray(appsData) ? appsData : []).map((app: any) => ({
        ...app,
        id: app.application_id || app.id,
        status: normalizeStatus(app.status || 'PENDING')
      }));
      setApplications(apps);
      if (apps.length > 0) auditOnChainStatus(apps);

      const proposalsData = unwrapResponse(proposalsRes);
      setActiveProposals(Array.isArray(proposalsData) ? proposalsData : []);

      const settings = unwrapResponse(multisigSettingsRes);
      if (settings && settings.threshold) {
        setAdminSettings(settings);
      }

      const notariesData = unwrapResponse(activeNotariesRes);
      const activeNotaries = (Array.isArray(notariesData) ? notariesData : []).map((notary: any) => ({
        ...notary,
        status: normalizeStatus(notary.status || 'ACTIVATED')
      }));

      // Merge logic
      const merged = [...apps];

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

  // Helper to determine on-chain status indicator
  const getOnChainIndicator = (notary: any) => {
    if (!notary.wallet_address) return null;
    const wallet = notary.wallet_address.toLowerCase();
    const isVerified = onChainStatuses[wallet];

    // Check if there is an active proposal for this notary
    const hasPendingProposal = activeProposals.some(p =>
      (p.type === 'NOTARY_PROMOTION' || p.type === 'add_notary') && // BUG-E fix: match both type formats
      p.target_id?.toLowerCase() === wallet &&
      (p.status === 'active' || p.status === 'signed' || p.status === 'passed')
    );

    if (isVerified) {
      return (
        <div className="h-2 w-2 rounded-full bg-emerald-500" title="On-Chain Verified ✅" />
      );
    }

    if (hasPendingProposal) {
      return (
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Promotion Pending Signature/Execution ⏳" />
      );
    }

    // 🛡️ [Hardening] Show Gray Dot while auditing, then Red if missing
    if (isVerified === undefined && isAuditing) {
      return (
        <div className="h-2 w-2 rounded-full bg-slate-500/50 animate-pulse" title="Verifying On-Chain Status..." />
      );
    }

    return (
      <div className="h-2 w-2 rounded-full bg-rose-500" title="Missing On-Chain (Action Required) ❌" />
    );
  };

  // ===============================
  // FILTER LOGIC
  // ===============================
  const visibleStatuses = ["PENDING", "KYC_VERIFIED", "APPROVED", "REJECTED", "ACTIVATED"];

  const filteredApplications = (Array.isArray(applications) ? applications : []).filter((app) => {
    if (!app) return false;
    
    // 🛡️ Exclude promoted notaries who are now Admins or Owners
    if (app.current_role === 'admin' || app.current_role === 'owner') {
      return false;
    }
    
    // 🛡️ Exclude if their wallet address is already part of the on-chain MultiSig signers
    if (app.wallet_address && adminSettings && adminSettings.signers) {
      const isSigner = adminSettings.signers.some(
        (signerAddress: string) => signerAddress.toLowerCase() === app.wallet_address.toLowerCase()
      );
      if (isSigner) return false;
    }

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

        // 🛡️ [BUG-G fix] Reload first so promotionDialog gets fresh data (correct wallet_address, id, etc.)
        await loadApplications();

        // Use a small delay to let state settle, then open the dialog with fresh app data
        setTimeout(() => {
          setPromotionDialog(prev => {
            // Try to find the refreshed record; fall back to original if not found
            return { open: true, application: targetApp };
          });
        }, 150);
      } else {
        await api.rejectNotaryApplication(targetId);
        toast.success("Application rejected");
        await loadApplications();
      }
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


  const handleDirectOnChainPromotion = async (app: any) => {
    try {
      const wallet = app.wallet_address.toLowerCase();
      const configRes = await api.getSystemConfig();
      const baseAuthUrl = configRes.remoteAuthUrl.replace(/\/$/, "");
      
      const remoteUrl = `${baseAuthUrl}/?mode=promote&targetAddress=${app.wallet_address}`;

      toast.info("Opening secure authorization portal in your browser...");

      // @ts-ignore
      if (window.electronAPI) {
        // @ts-ignore
        window.electronAPI.openExternal(remoteUrl);
      } else {
        window.open(remoteUrl, "_blank");
      }

      // 🛡️ [STATE_LOCK] Mark as in-flight
      setInFlightPromotions(prev => ({ ...prev, [wallet]: true }));
      
      // 🛡️ [INTELLIGENT_POLLING] Poll every 5s for 2 minutes or until verified
      let attempts = 0;
      const maxAttempts = 24; // 24 * 5s = 120s
      
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          console.log(`📡 [POLL_${attempts}] Checking on-chain status for ${wallet}...`);
          const res = await api.getOnChainRole(wallet);
          
          if (res.data.isOnChain) {
            console.log(`✅ [POLL_SUCCESS] ${wallet} is now verified on-chain!`);
            setOnChainStatuses(prev => ({ ...prev, [wallet]: true }));
            setInFlightPromotions(prev => ({ ...prev, [wallet]: false }));
            toast.success(`Blockchain role finalized for ${app.full_name || app.name}`);
            clearInterval(pollInterval);
            loadApplications(); // Full refresh
          } else if (attempts >= maxAttempts) {
            console.warn(`⏳ [POLL_TIMEOUT] ${wallet} promotion still pending after 2m.`);
            setInFlightPromotions(prev => ({ ...prev, [wallet]: false }));
            clearInterval(pollInterval);
          }
        } catch (err) {
          console.error(`❌ [POLL_ERROR] ${wallet}:`, err);
        }
      }, 5000);

    } catch (err: any) {
      console.error("[PROMOTION_FAIL]", err);
      toast.error(err.message || "Failed to initiate remote promotion.");
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
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden min-h-0">
      <div className="flex-none p-8 pt-10 pb-8 border-b border-border/50 bg-background">
        <h1 className="text-3xl font-bold text-foreground tracking-tight leading-none mb-2">Notary Management</h1>
        <p className="text-sm text-muted-foreground font-medium">
          Review and process notary candidate applications and on-chain roles.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative" style={{ height: '0px', flex: '1 1 0%', minHeight: '0px' }}>
        <div className="p-8 pb-12">

          {syncError && (
            <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-500 text-sm font-bold animate-pulse">
              <ShieldAlert size={18} />
              {syncError}
            </div>
          )}

          <div className="flex flex-col gap-8">
            {/* 🔍 Search and Filters */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
                <Input
                  placeholder="Search by name or License ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-muted/50 border-border text-foreground focus:ring-primary/20 focus:border-primary/50 pl-10 h-12"
                />
              </div>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-56 bg-muted/50 border-border/50 text-foreground rounded-xl h-12">
                  <Filter size={16} className="mr-2 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="all">ALL STATUS</SelectItem>
                  <SelectItem value="PENDING">PENDING</SelectItem>
                  <SelectItem value="KYC_VERIFIED">VERIFIED</SelectItem>
                  <SelectItem value="APPROVED">APPROVED</SelectItem>
                  <SelectItem value="ACTIVATED">ACTIVE NOTARIES</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
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
                          <ShieldAlert size={32} strokeWidth={2} className="text-slate-500/50" />
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-400">No applications found</p>
                            <p className="text-xs text-slate-600 mt-1">There are currently no notary applications requiring review.</p>
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
                            <div className="flex items-center gap-4">
                              {getStatusBadge(app.status)}
                              {getOnChainIndicator(app)}
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

                              {status === "APPROVED" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDirectOnChainPromotion(app)}
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

      </div>

    {/* ── Dialogs rendered at root level so backdrop covers the full window ── */}

    {/* Confirmation Dialog */}
    <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
      <DialogContent className="bg-[#0b101f] border-border text-foreground !opacity-100 shadow-2xl">
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0b101f', zIndex: -1, borderRadius: 'inherit' }} />
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
      <DialogContent className="bg-[#0b101f] border-border text-foreground max-w-2xl !opacity-100 shadow-2xl">
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0b101f', zIndex: -1, borderRadius: 'inherit' }} />
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
                  <h4 className="text-sm font-medium text-muted-foreground">Phone Number</h4>
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
                    <CheckCircle size={14} /> Identity Integrity Verified
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Experience & Qualifications</h4>
              <div className="mt-2 p-3 bg-slate-900/40 rounded-lg border border-border text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
                {viewDialog.application?.experience || "No details provided."}
              </div>
            </div>

            <div className="pt-2">
              <h4 className="text-sm font-medium text-muted-foreground">On-Chain Wallet</h4>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-foreground truncate bg-slate-900/50 p-2 rounded font-mono flex-1 border border-border/50">
                  {viewDialog.application?.wallet_address}
                </p>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-700 hover:bg-primary/10"
                  onClick={() => handleCopy(viewDialog.application?.wallet_address, 'view-wallet')}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-6 border-t border-border/50">
            <Button 
              variant="outline" 
              onClick={() => setViewDialog({ ...viewDialog, open: false })}
              className="px-6 py-2 border-slate-600 bg-slate-800/80 hover:bg-slate-700 text-white font-bold shadow-lg"
            >
              Close Profile
            </Button>

              <div className="flex-1" />

              {viewDialog.application?.status === 'KYC_VERIFIED' && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setViewDialog({ ...viewDialog, open: false });
                      handleAction("reject", viewDialog.application);
                    }}
                    variant="destructive"
                    className="px-8 h-12 rounded-xl font-bold shadow-lg shadow-rose-900/20"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      setViewDialog({ ...viewDialog, open: false });
                      handleAction("approve", viewDialog.application);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 h-12 rounded-xl font-bold shadow-lg shadow-emerald-900/20"
                  >
                    Approve Notary
                  </Button>
                </div>
              )}

              {(() => {
                const wallet = viewDialog.application?.wallet_address?.toLowerCase();
                const isVerified = wallet && onChainStatuses[wallet];

                if (viewDialog.application?.wallet_address &&
                  (normalizeStatus(viewDialog.application.status) === 'APPROVED' || normalizeStatus(viewDialog.application.status) === 'ACTIVATED') &&
                  !isVerified) {
                  
                  const isInFlight = inFlightPromotions[wallet || ""];

                  return (
                    <Button
                      onClick={() => handleDirectOnChainPromotion(viewDialog.application)}
                      disabled={isInFlight}
                      className={`${isInFlight ? 'bg-slate-700 opacity-50 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700 hover:scale-[1.02]'} text-white px-8 h-12 rounded-xl font-bold shadow-lg shadow-amber-900/40 transition-all border border-amber-500/30 flex items-center gap-2 group`}
                    >
                      {isInFlight ? (
                        <>
                          <RotateCw size={18} className="animate-spin" />
                          Finalizing on Blockchain...
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={18} className="group-hover:rotate-12 transition-transform" />
                          Finalize Blockchain Role
                        </>
                      )}
                    </Button>
                  );
                }
                return null;
              })()}
            </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 🛡️ Direct Sync Dialog (Post-Approval) */}
    <Dialog open={promotionDialog.open} onOpenChange={(open) => setPromotionDialog({ ...promotionDialog, open })}>
      <DialogContent className="bg-[#0d1425] border-amber-500/30 text-white max-w-md rounded-2xl shadow-2xl !opacity-100">
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0d1425', zIndex: -1, borderRadius: 'inherit' }} />
            <DialogHeader>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 shadow-inner">
                  <ShieldCheck size={48} className="text-amber-500 animate-pulse" />
                </div>
              </div>
              <DialogTitle className="text-center text-2xl font-bold tracking-tight text-white">Activation Complete</DialogTitle>
              <DialogDescription className="text-center text-slate-400 mt-2 px-4">
                The application for <span className="text-amber-400 font-bold">{promotionDialog.application?.name || promotionDialog.application?.full_name}</span> is now approved.
                <br /><br />
                Finalize the process by granting the <span className="text-white font-bold underline decoration-amber-500/50 underline-offset-4">On-Chain Notary Role</span> via your administrative wallet.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3 group transition-all hover:bg-white/10">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Registry Target Address</p>
                  <button
                    onClick={() => handleCopy(promotionDialog.application?.wallet_address, 'promo-wallet')}
                    className="text-slate-500 hover:text-amber-400 p-1 transition-colors"
                  >
                    <FileText size={14} />
                    {copiedId === 'promo-wallet' && (
                      <span className="absolute -top-8 right-0 px-2 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg shadow-xl z-50">
                        COPIED
                      </span>
                    )}
                  </button>
                </div>
                <code className="text-xs text-amber-500 block truncate font-mono bg-black/30 p-2 rounded-lg border border-white/5">
                  {promotionDialog.application?.wallet_address}
                </code>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-col gap-3 pb-4">
              <Button
                onClick={() => {
                  handleDirectOnChainPromotion(promotionDialog.application);
                  setPromotionDialog({ open: false, application: null });
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-amber-900/40 border border-amber-500/30 transition-all hover:scale-[1.02]"
              >
                <ShieldCheck size={18} className="mr-2" />
                Finalize Blockchain Role
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPromotionDialog({ open: false, application: null })}
                className="w-full text-slate-500 hover:text-white hover:bg-white/5 h-10 rounded-xl font-medium"
              >
                I'll Sync Later
              </Button>
            </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
}

