import { useState, useEffect } from "react";
import { Eye, Download, FileText, ImageIcon, Search, RefreshCw, Loader2, Database, Shield, Hash } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import api from "../../services/api";
import { toast } from "sonner";

interface LogEntry {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  status: 'SUCCESS' | 'FAILED';
  details: string;
  tx_hash: string | null;
}

export function SystemLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSystemLogs();
      // 🛡️ [SECURITY] Hardened array access to prevent renderer crash
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("[SYSTEM_LOGS_FAIL]", err);
      toast.error("Failed to load system audit logs");
      setLogs([]); // 🛡️ Maintain stable state on failure
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = (Array.isArray(logs) ? logs : []).filter((log) => {
    if (!log) return false;
    if (filterType === "all") return true;
    return (log.action?.toLowerCase() || "").includes(filterType.toLowerCase());
  }).filter((log) =>
    (log.actor?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (log.details?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (log.tx_hash?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const isSuccess = (status || "").toUpperCase() === 'SUCCESS';
    return (
      <Badge variant="outline" className={`${isSuccess ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'} uppercase tracking-widest text-[9px] font-black`}>
        {status || "UNKNOWN"}
      </Badge>
    );
  };

  const handleExport = () => {
    // Basic CSV export logic
    const headers = ["ID", "Timestamp", "Actor", "Action", "Details", "Status", "TX Hash"];
    const rows = filteredLogs.map(log => [
      log.id,
      new Date(log.timestamp).toLocaleString(),
      log.actor || "SYSTEM",
      log.action || "N/A",
      log.details || "",
      log.status || "UNKNOWN",
      log.tx_hash || ""
    ]);

    let csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bbsns_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audit logs exported as CSV");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-8 pt-12 pb-8 border-b border-border/50 bg-background">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl font-black text-foreground italic tracking-tighter uppercase leading-none mb-3">SYSTEM AUDIT</h1>
              <p className="text-sm text-slate-400 font-medium italic">Comprehensive record of all network activities</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading} className="border-border/50 text-muted-foreground hover:text-foreground rounded-xl h-11 px-4 bg-muted/30">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button onClick={handleExport} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-primary-foreground font-black rounded-xl h-11 px-6 shadow-lg shadow-emerald-500/10">
                <Download className="mr-2" size={16} />
                EXPORT AUDIT
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <Input
                placeholder="Search actor, details, or tx hash..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 bg-input border-border text-foreground rounded-xl h-12 w-full focus:border-primary/50 shadow-inner"
              />
            </div>
            <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50">
              {["all", "MINT", "BURN", "MULTISIG"].map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={filterType === type ? "default" : "ghost"}
                  onClick={() => setFilterType(type)}
                  className={`rounded-lg capitalize whitespace-nowrap px-6 py-2 h-10 text-[11px] font-black tracking-widest ${filterType === type ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  {type === 'all' ? 'ALL LOGS' : type}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="p-8 pb-32">
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-3xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary/40 mb-4" />
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Synchronizing Audit Trail...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-3xl">
            <Database className="h-10 w-10 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px]">No logs found in this query</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow className="border-border hover:bg-transparent bg-muted/10">
                  <TableHead className="py-3 text-muted-foreground uppercase text-[10px] font-black tracking-widest w-[160px] pl-6">Timestamp</TableHead>
                  <TableHead className="py-3 text-muted-foreground uppercase text-[10px] font-black tracking-widest w-[180px]">Actor</TableHead>
                  <TableHead className="py-3 text-muted-foreground uppercase text-[10px] font-black tracking-widest w-[120px]">Action</TableHead>
                  <TableHead className="py-3 text-muted-foreground uppercase text-[10px] font-black tracking-widest min-w-[300px]">Details</TableHead>
                  <TableHead className="py-3 text-muted-foreground uppercase text-[10px] font-black tracking-widest w-[100px] text-right pr-6">Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-border hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground pl-6 align-top py-3">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <div className="flex items-center gap-2">
                        <div className={`shrink-0 h-6 w-6 rounded-full ${(log.actor || "").startsWith('0x') ? 'bg-muted' : 'bg-primary/20'} flex items-center justify-center text-[10px] font-black ${(log.actor || "").startsWith('0x') ? 'text-muted-foreground' : 'text-primary'}`}>
                          {(log.actor || "SY").substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[12px] font-bold text-foreground truncate max-w-[140px]" title={log.actor || "System Entity"}>
                          {(log.actor || "").startsWith('0x') ? `${log.actor.slice(0, 6)}...${log.actor.slice(-4)}` : (log.actor || "System Authority")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <Badge variant="secondary" className="bg-muted/50 text-[9px] font-black text-muted-foreground border-none px-2 whitespace-nowrap">
                        {(log.action || "EVENT").replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground font-medium align-top py-3">
                      <div className="break-words whitespace-normal leading-relaxed max-w-[500px]">
                        {log.details}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6 align-top py-3">
                      {getStatusBadge(log.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary Footer */}
        {!isLoading && (
          <div className="mt-6 flex items-center justify-between text-[10px] text-muted-foreground uppercase font-black tracking-widest px-1">
            <span>Showing {filteredLogs.length} of {logs.length} indexed records</span>
            <span className="text-primary/40 italic flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Live Audit Authority Active
            </span>
          </div>
        )}
      </div>
    </div>

      {/* Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl shadow-2xl rounded-3xl overflow-hidden p-0">
          <div className="p-8 space-y-8">
            <div className="flex items-center justify-between border-b border-border pb-6">
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Transaction Proof</p>
                <DialogTitle className="text-3xl font-black">{(selectedLog?.action || "EVENT").replace(/_/g, ' ')}</DialogTitle>
                <DialogDescription className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mt-1">
                  Technical audit details for system event #{selectedLog?.id || "0"}
                </DialogDescription>
              </div>
              {selectedLog && getStatusBadge(selectedLog.status)}
            </div>

            {selectedLog && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-muted/30 p-6 rounded-2xl border border-border flex flex-col justify-center">
                    <p className="text-[10px] text-muted-foreground mb-2 font-black uppercase tracking-widest">Authorized Actor</p>
                    <p className="text-sm text-foreground font-black break-all">{selectedLog.actor}</p>
                  </div>
                  <div className="bg-muted/30 p-6 rounded-2xl border border-border flex flex-col justify-center">
                    <p className="text-[10px] text-muted-foreground mb-2 font-black uppercase tracking-widest">Timestamp</p>
                    <p className="text-sm text-foreground font-black">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-primary/5 p-8 rounded-2xl border border-primary/10">
                  <p className="text-[10px] text-primary mb-3 font-black uppercase tracking-widest flex items-center">
                    <Shield className="h-4 w-4 mr-2" />
                    Action Narrative
                  </p>
                  <p className="text-base text-foreground font-medium leading-relaxed italic">
                    "{selectedLog.details}"
                  </p>
                </div>

                {selectedLog.tx_hash && (
                  <div className="bg-muted/50 border border-border p-6 rounded-2xl">
                    <p className="text-[10px] text-muted-foreground mb-3 font-black uppercase tracking-widest flex items-center">
                      <Hash className="h-4 w-4 mr-2" />
                      Blockchain Hash
                    </p>
                    <p className="text-[11px] text-primary/90 font-mono break-all font-bold leading-loose group flex items-start justify-between bg-background/50 p-4 rounded-xl border border-border/50">
                      <span className="selectable">{selectedLog.tx_hash}</span>
                      <ExternalLink size={14} className="ml-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity mt-1" />
                    </p>
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedLog(null)} className="rounded-xl border-border uppercase text-[10px] font-black tracking-widest h-10 px-6">
                    Close Audit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ExternalLink = ({ size, className }: { size: number, className: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)
