import { useState, useEffect } from "react";
import { Search, Filter, UserCheck, UserX, Eye, CheckCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { toast } from "sonner";
import api from "../../services/api";

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

  // ===============================
  // LOAD DATA
  // ===============================
  const loadApplications = async () => {
    try {
      const [applicationsData, activeNotaries] = await Promise.all([
        api.getNotaryApplications(),
        api.getNotaries()
      ]);

      const merged = [...applicationsData];

      activeNotaries.forEach((notary: any) => {
        const existing = merged.find(a =>
          (a.wallet_address || "").toLowerCase() === (notary.wallet_address || "").toLowerCase()
        );

        if (!existing) {
          merged.push({ ...notary, status: "approved" });
        } else {
          existing.id = existing.id || notary.id;
          if (notary.role === "notary") {
            existing.status = "approved";
          }
        }
      });

      setApplications(merged);
    } catch (err: any) {
      toast.error(err.message || "Failed to load applications");
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // ===============================
  // FILTER LOGIC (NO PENDING)
  // ===============================
  const visibleStatuses = ["pending", "applied", "approved", "rejected", "kyc_verified"];

  const filteredApplications = applications.filter((app) => {
    const status = (app.status || "").toLowerCase();

    if (!visibleStatuses.includes(status)) return false;

    const matchesSearch =
      (app.name || app.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.license_number || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === "all" ||
      status === filterStatus.toLowerCase();

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
      if (confirmDialog.action === "approve") {
        await api.approveNotaryApplication(confirmDialog.application.application_id);
        toast.success("Application approved successfully");
      } else {
        await api.rejectNotaryApplication(confirmDialog.application.application_id);
        toast.success("Application rejected");
      }

      await loadApplications();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setConfirmDialog({ open: false, action: "", application: null });
    }
  };

  const openView = (app: any) => {
    setViewDialog({ open: true, application: app });
  };

  // ===============================
  // STATUS BADGE (NO DEFAULT PENDING)
  // ===============================
  const getStatusBadge = (status: string | undefined | null) => {
    if (!status) return null;

    const variants: Record<string, string> = {
      approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      rejected: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      applied: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      kyc_verified: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    };

    return (
      <Badge className={`${variants[status.toLowerCase()] || variants.applied} border`}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="flex-1 bg-background overflow-auto">
      <div className="p-6 border-b">
        <h1>Manage Notary Applications</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve verification requests
        </p>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              placeholder="Search by name or License ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <Filter size={16} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="kyc_verified">KYC Verified</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>License No.</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredApplications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredApplications.map((app) => {
                  const status = (app.status || "").toLowerCase();
                  const canAdminAct = ["applied", "kyc_verified"].includes(status);

                  return (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.name || app.full_name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {app.license_number}
                      </TableCell>
                      <TableCell className="text-sm">{app.email}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
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
                {viewDialog.application?.status?.toLowerCase() === 'kyc_verified' && (
                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                    <CheckCircle size={14} /> Biometric & ID Match Confirmed
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
              <p className="text-[10px] text-muted-foreground truncate bg-muted p-2 rounded mt-1 font-mono">
                {viewDialog.application?.wallet_address}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
