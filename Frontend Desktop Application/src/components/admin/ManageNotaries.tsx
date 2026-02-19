import { useState, useEffect } from "react";
import { Search, Filter, UserCheck, UserX, Eye, CheckCircle, XCircle, AlertCircle, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { toast } from "sonner";
import api from "../../api";

export function ManageNotaries() {
  const [applications, setApplications] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: string;
    application: any | null;
  }>({ open: false, action: "", application: null });
  const [viewDialog, setViewDialog] = useState<{
    open: boolean;
    application: any | null;
  }>({ open: false, application: null });

  // Load Real Data
  const loadApplications = async () => {
    try {
      const [pendingApps, activeNotaries] = await Promise.all([
        api.getNotaryApplications(),
        api.getNotaries()
      ]);

      // Normalize data
      const normalizedPending = pendingApps.map((app: any) => ({ ...app, status: 'pending' }));
      const normalizedActive = activeNotaries.map((n: any) => ({ ...n, status: 'approved' }));

      setApplications([...normalizedPending, ...normalizedActive]);
    } catch (err: any) {
      console.error("Failed to load applications", err);
      toast.error(err.message || "Failed to load applications");
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      (app.name || app.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.license_number || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || (app.status || "pending").toLowerCase() === filterStatus;
    // For now the API only returns pending, but filtering is good practice
    return matchesSearch && matchesFilter;
  });

  const handleAction = (action: string, application: any) => {
    setConfirmDialog({ open: true, action, application });
  };

  const confirmAction = async () => {
    if (!confirmDialog.application) return;
    try {
      if (confirmDialog.action === 'approve') {
        await api.approveNotaryApplication(confirmDialog.application.id);
        toast.success("Application approved and account activated!");
      } else {
        await api.rejectNotaryApplication(confirmDialog.application.id);
        toast.success("Application rejected.");
      }
      await loadApplications(); // Refresh list
    } catch (err: any) {
      console.error("Action failed", err);
      toast.error(err.message || "Operation failed");
    } finally {
      setConfirmDialog({ open: false, action: "", application: null });
    }
  };

  const openView = (app: any) => {
    setViewDialog({ open: true, application: app });
  }

  const getStatusBadge = (status: string | undefined | null) => {
    const safeStatus = status || "pending";
    const variants: Record<string, string> = {
      approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      rejected: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      applied: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      kyc_verified: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    };
    return (
      <Badge className={`${variants[safeStatus.toLowerCase()] || variants.pending} border`}>
        {safeStatus}
      </Badge>
    );
  };

  return (
    <div className="flex-1 bg-background overflow-auto">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
        <div className="p-6">
          <h1 className="text-foreground mb-1">Manage Notary Applications</h1>
          <p className="text-sm text-muted-foreground">Review and approve verification requests</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <Input
              placeholder="Search by name or License ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-card border-border text-foreground rounded-xl h-11"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48 bg-card border-border text-foreground rounded-xl h-11">
              <Filter className="mr-2" size={16} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="KYC_VERIFIED">KYC Verified</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">License No.</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    No pending applications found.
                  </TableCell>
                </TableRow>
              ) : filteredApplications.map((app) => (
                <TableRow key={app.id} className="border-border hover:bg-muted/50">
                  <TableCell className="text-foreground font-medium">{app.name || app.full_name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{app.license_number}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{app.email}</TableCell>
                  <TableCell>{getStatusBadge(app.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openView(app)}
                        className="text-primary hover:bg-primary/20 rounded-lg hover:text-primary"
                      >
                        <Eye size={14} className="mr-1" />
                        View
                      </Button>

                      {((app.status || "pending") === "pending" || (app.status || "pending") === "applied" || (app.status || "pending").toLowerCase() === "kyc_verified") && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleAction("approve", app)}
                            className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 rounded-lg"
                          >
                            <UserCheck size={14} className="mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAction("reject", app)}
                            className="bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30 rounded-lg"
                          >
                            <UserX size={14} className="mr-1" />
                            Reject
                          </Button>
                        </>
                      )}

                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Review full profile and verification data for this notary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Applicant Name</h4>
              <p className="text-foreground">{viewDialog.application?.name || viewDialog.application?.full_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">License Number</h4>
                <p className="font-mono text-primary">{viewDialog.application?.license_number || "Not provided"}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Nationality</h4>
                <p className="text-foreground">{viewDialog.application?.nationality || "Not specified"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Phone</h4>
                <p className="text-foreground">{viewDialog.application?.phone || "Not provided"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Verification Status</h4>
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className={viewDialog.application?.status === 'KYC_VERIFIED' ? 'border-primary text-primary' : 'border-blue-500 text-blue-500'}>
                    {viewDialog.application?.status}
                  </Badge>
                  {viewDialog.application?.status === 'KYC_VERIFIED' && (
                    <>
                      <div className="flex items-center text-[10px] text-primary gap-1 font-medium">
                        <CheckCircle size={10} /> Liveness Check: Passed
                      </div>
                      <div className="flex items-center text-[10px] text-primary gap-1 font-medium">
                        <CheckCircle size={10} /> Wallet Binding: Passed
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Experience & Qualifications</h4>
              <p className="text-foreground text-sm p-3 bg-muted rounded-lg mt-1 border border-border">
                {viewDialog.application?.experience}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">User Wallet</h4>
              <p className="text-xs text-muted-foreground break-all font-mono selectable">{viewDialog.application?.wallet_address}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
