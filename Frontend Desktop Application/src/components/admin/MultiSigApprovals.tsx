import { useState, useEffect } from "react";
import {
  CheckCircle,
  Shield,
  AlertTriangle,
  Eye,
  ArrowRight,
  Loader2,
  ExternalLink,
  ChevronRight,
  Settings,
  UserPlus,
  UserMinus,
  Lock,
  FileText,
  Clock,
  Terminal
} from "lucide-react";
import { SystemLogs } from "./SystemLogs";
import { Button } from "../ui/button";
import { useConfig } from "../../contexts/ConfigAuthority";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { toast } from "sonner";
import api from "../../services/api";
import { ethers } from "ethers";

// Simple ABI for decoding Multi-Sig and Target contract actions
const ABI_INTERFACES = [
  "function addSigner(address signer)",
  "function removeSigner(address signer)",
  "function promoteAdmin(address newAdmin, address registry)",
  "function demoteAdmin(address admin, address registry)",
  "function changeThreshold(uint256 threshold)",
  "function setTimelock(uint256 delay)",
  "function recordAction(bytes32 docHash, uint8 status)",
  "function updateDailyLimit(uint256 limit)",
  "function setRelayer(address relayer)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function setContractMetadata(string name, string symbol)"
];

const iface = new ethers.Interface(ABI_INTERFACES);

function decodeMethod(data: string) {
  if (!data || data === "0x") return { name: "Ether Transfer", args: [], inputs: [] };
  try {
    const decoded = iface.parseTransaction({ data });
    if (!decoded) return { name: "Custom Call", args: [data.slice(0, 10) + "..."], inputs: [] };

    return {
      name: decoded.name.replace(/([A-Z])/g, ' $1').trim(),
      args: decoded.args.map(a => a.toString()),
      inputs: decoded.fragment.inputs.map(input => input.name || "param")
    };
  } catch (e: any) {
    return { name: `Unknown Operation (${e.message})`, args: [data.slice(0, 10) + "..."], inputs: [] };
  }
}

function getImpactMessage(data: string) {
  const method = decodeMethod(data);
  switch (method.name) {
    case "add Signer":
      return `This will grant administrative powers to ${method.args[0]}. They will be able to propose and sign protocol changes.`;
    case "remove Signer":
      return `This will revoke administrative powers from ${method.args[0]}. They will no longer be able to authorize protocol actions.`;
    case "promote Admin":
      return `This will grant Protocol Admin and Multi-Sig powers to ${method.args[0]} in one single transaction (V2 Auto-Coordinator).`;
    case "demote Admin":
      return `This will revoke Protocol Admin and Multi-Sig powers from ${method.args[0]} in one single transaction (V2 Auto-Coordinator).`;
    case "change Threshold":
      return `This will change the security rule to require ${method.args[0]} separate signatures before any action can be executed on-chain.`;
    case "set Timelock":
      return `This will update the security delay to ${parseInt(method.args[0]) / 3600} hours. Executable actions will be locked for this duration after consensus.`;
    case "record Action":
      return `This will permanently notarize a document status update on the blockchain for document hash ${method.args[0].slice(0, 10)}...`;
    case "pause":
      return "This will EMERGENCY PAUSE all protocol operations. Administrative actions and token transfers may be halted.";
    case "unpause":
      return "This will resume protocol operations after a pause.";
    default:
      return "This action will modify protocol state or contract parameters as defined in the technical payload.";
  }
}
export function MultiSigApprovals() {
  const { config } = useConfig();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [signerNames, setSignerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [contractAddress, setContractAddress] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [processing, setProcessing] = useState<number | null>(null);
  const isSingleAdmin = threshold === 1;

  const [detailsDialog, setDetailsDialog] = useState<{
    open: boolean;
    tx: any | null;
  }>({ open: false, tx: null });

  const [timelockDelay, setTimelockDelay] = useState(0);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  const [userAddress, setUserAddress] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
    checkUserWallet();

    // Listen for account changes
    // @ts-ignore
    // @ts-ignore
    if (window.ethereum) {
      // @ts-ignore
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts && accounts.length > 0) setUserAddress(accounts[0].toLowerCase());
        else setUserAddress(null);
      });
    }

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => {
      clearInterval(interval);
      // @ts-ignore
      if (window.ethereum && window.ethereum.removeListener) {
        // Cleanup although standard listeners usually persist
      }
    };
  }, []);

  const checkUserWallet = async () => {
    // @ts-ignore
    if (window.ethereum) {
      try {
        // @ts-ignore
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) setUserAddress(accounts[0].toLowerCase());
      } catch (err) {
        console.error("Failed to get accounts", err);
      }
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.getMultiSigTransactions();
      
      // 🛡️ [SECURITY] Hardened object and array extraction
      const txArray = Array.isArray(res?.transactions) ? res.transactions : [];
      
      // 🛡️ [COMPATIBILITY] Normalize JSON encoded data arrays
      const cleanedTxArray = txArray.map((tx: any) => {
          let payload = tx.data;
          if (Array.isArray(payload)) {
              if (payload.length > 0 && payload[0].data) payload = payload[0].data;
              else if (payload.length > 0 && typeof payload[0] === 'string') payload = payload[0];
          } else if (typeof payload === 'string' && payload.startsWith('[')) {
              try {
                  const parsed = JSON.parse(payload);
                  if (Array.isArray(parsed) && parsed.length > 0) payload = parsed[0].data || parsed[0] || "0x";
              } catch(e) {}
          }
          return { ...tx, data: payload, originalData: tx.data };
      });

      setTransactions(cleanedTxArray);
      setContractAddress(res?.address || "");
      setThreshold(res?.threshold || 2);
      setTimelockDelay(res?.timelockDelay || 0);
      if (res?.signerNames) {
        setSignerNames(res.signerNames);
      }

      // If dialog is open, update the active tx data
      if (detailsDialog.open && detailsDialog.tx) {
        const updatedTx = cleanedTxArray.find((t: any) => t.index === detailsDialog.tx.index);
        if (updatedTx) setDetailsDialog(prev => ({ ...prev, tx: updatedTx }));
      }
    } catch (err: any) {
      console.error("[MULTISIG_TX_LOAD_FAIL]", err);
      toast.error("Failed to load Multi-Sig transactions");
      setTransactions([]); // 🛡️ Maintain stable state on failure
    } finally {
      setLoading(false);
    }
  };

  const getTimelockInfo = (tx: any) => {
    if (!tx || tx.executed) return { active: false, remaining: 0 };
    const readyAt = tx.submissionTime + timelockDelay;
    const remaining = readyAt - currentTime;
    return { active: remaining > 0, remaining };
  };

  const formatRemaining = (seconds: number) => {
    if (seconds <= 0) return "Ready";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const handleTxClick = (tx: any) => {
    setDetailsDialog({ open: true, tx });
  };

  const [remoteSessionLink, setRemoteSessionLink] = useState<string | null>(null);

  const confirmAction = async () => {
    if (!detailsDialog.tx || !contractAddress) return;

    const tx = detailsDialog.tx;
    setProcessing(tx.index);

    try {
      // @ts-ignore
      if (!window.ethereum) {
        // --- REMOTE SIGNING FLOW ---
        const session = await api.initRemoteMultiSigSession(tx.index);
        const baseAuthUrl = (config?.remoteAuthUrl || "https://auth.bbsns.online").replace(/\/$/, "");
        const link = `${baseAuthUrl}/?mode=multisig&sessionId=${session.sessionId}`;
        setRemoteSessionLink(link);

        // Open automatically if possible
        if ((window as any).electronAPI) {
          (window as any).electronAPI.openExternal(link);
        } else {
          window.open(link, '_blank');
        }

        // Poll for completion
        let consecutiveErrors = 0;
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await api.checkRemoteMultiSigStatus(session.sessionId);
            consecutiveErrors = 0;
            if (statusRes.status === 'authorized' || statusRes.status === 'executed') {
              clearInterval(pollInterval);
              toast.success("Remote Confirmation Received!");
              setProcessing(null);
              setDetailsDialog({ open: false, tx: null });
              loadTransactions();
            } else if (statusRes.status === 'expired' || statusRes.status === 'error') {
              clearInterval(pollInterval);
              toast.error("Remote session expired or failed.");
              setProcessing(null);
            }
          } catch (e) {
            console.error("Poll Error:", e);
            consecutiveErrors++;
            if (consecutiveErrors >= 5) {
              clearInterval(pollInterval);
              toast.error("Network communication lost. Handshake terminated.");
              setProcessing(null);
            }
          }
        }, 2000);

        // Stop polling after 10 minutes (safety)
        setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
        return;
      }

      // --- LOCAL METAMASK FLOW ---
      // @ts-ignore
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, ["function confirmTransaction(uint256 txIndex)"], signer);

      const txCall = await contract.confirmTransaction(tx.index);
      toast.info("Confirmation transaction submitted. Waiting for confirmation...");
      await txCall.wait();

      toast.success("Confirmation transaction finalized on-chain!");
      loadTransactions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to confirm transaction");
    } finally {
      // Only clear processing if we are NOT in remote polling mode (or if local flow finished)
      // We'll leave it 'processing' for remote flow until poll succeeds or fails
      // But wait, the 'finally' runs immediately after the async block finishes.
      // For remote flow, we return early, so we need to be careful.
      // Actually 'finally' runs even after return? No, this is a function.
      // If I return inside try, finally still runs.
      // So I must NOT clear processing in finally if I started remote flow.
      // I'll handle that by checking windows.ethereum
      // @ts-ignore
      if (window.ethereum) {
        setProcessing(null);
      }
    }
  };

  const executeAction = async () => {
    if (!detailsDialog.tx || !contractAddress) return;
    const tx = detailsDialog.tx;

    // Safety check for timelock
    const { active, remaining } = getTimelockInfo(tx);
    if (active) {
      toast.error(`Timelock active. Please wait ${formatRemaining(remaining)}.`);
      return;
    }

    setProcessing(tx.index);
    try {
      // @ts-ignore
      if (window.ethereum) {
        // --- LOCAL METAMASK FLOW ---
        // @ts-ignore
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, ["function executeTransaction(uint256 txIndex)"], signer);

        toast.info("Submitting execution transaction via MetaMask...");
        const txCall = await contract.executeTransaction(tx.index);
        toast.info("Execution transaction submitted. Waiting for blockchain confirmation...");
        await txCall.wait();

        // Sync with the backend manually after successful on-chain execution so that the status is updated to 'executed' off-chain too
        try {
          await api.executeMultiSigTransaction(tx.index, txCall.hash);
        } catch (syncErr) {
          console.warn("Failed to notify backend of execution:", syncErr);
        }

        toast.success("Transaction executed successfully on-chain!");
        setDetailsDialog({ open: false, tx: null });
        loadTransactions();
      } else {
        // --- REMOTE EXECUTION FLOW ---
        const session = await api.initRemoteMultiSigExecuteSession(tx.index);
        const baseAuthUrl = (config?.remoteAuthUrl || "https://auth.bbsns.online").replace(/\/$/, "");
        const link = `${baseAuthUrl}/?mode=gov-execute&sessionId=${session.sessionId}`;
        setRemoteSessionLink(link);

        // Open automatically if possible
        if ((window as any).electronAPI) {
          (window as any).electronAPI.openExternal(link);
        } else {
          window.open(link, '_blank');
        }

        // Poll for completion
        let consecutiveErrors = 0;
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await api.checkRemoteMultiSigExecuteStatus(session.sessionId);
            consecutiveErrors = 0;
            if (statusRes.status === 'authorized' || statusRes.status === 'executed') {
              clearInterval(pollInterval);
              toast.success("Remote Execution Confirmed!");
              setProcessing(null);
              setDetailsDialog({ open: false, tx: null });
              loadTransactions();
            } else if (statusRes.status === 'expired' || statusRes.status === 'error') {
              clearInterval(pollInterval);
              toast.error("Remote session expired or failed.");
              setProcessing(null);
            }
          } catch (e) {
            console.error("Poll Error:", e);
            consecutiveErrors++;
            if (consecutiveErrors >= 5) {
              clearInterval(pollInterval);
              toast.error("Network communication lost. Handshake terminated.");
              setProcessing(null);
            }
          }
        }, 2000);

        // Stop polling after 10 minutes (safety)
        setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
        return;
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to execute transaction");
    } finally {
      // @ts-ignore
      if (window.ethereum) {
        setProcessing(null);
      }
    }
  };

  const revokeAction = async () => {
    if (!detailsDialog.tx || !contractAddress) return;
    const tx = detailsDialog.tx;
    setProcessing(tx.index);

    try {
      // @ts-ignore
      if (!window.ethereum) {
        toast.error("No crypto wallet found.");
        return;
      }

      // @ts-ignore
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, ["function revokeConfirmation(uint256 txIndex)"], signer);

      const txCall = await contract.revokeConfirmation(tx.index);
      toast.info("Revocation transaction submitted. Waiting for confirmation...");
      await txCall.wait();

      toast.success("Confirmation revoked successfully!");
      loadTransactions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to revoke confirmation");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden min-h-0">
      {/* Header */}
      <div className="flex-none p-8 pt-10 pb-8 border-b border-border bg-background">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight leading-none mb-2">Governance Approvals</h1>
            <p className="text-sm text-muted-foreground font-medium">Review and authorize administrative protocol actions and multi-sig transactions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTransactions} disabled={loading} className="rounded-xl px-6 h-11 border-border hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative" style={{ maxHeight: '60vh' }}>
        <div className="p-8 pb-32">
        {loading && transactions.length === 0 ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-border rounded-xl bg-muted/20">
            <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Pending Transactions</h3>
            <p className="text-muted-foreground text-sm">The protocol is currently in a settled state.</p>
          </div>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-2xl shadow-black/40">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[80px] font-black uppercase text-[10px] tracking-widest text-muted-foreground py-4">Index</TableHead>
                  <TableHead className="w-[200px] font-black uppercase text-[10px] tracking-widest text-muted-foreground">Operation</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-muted-foreground">Target / Parameters</TableHead>
                  <TableHead className="w-[140px] font-black uppercase text-[10px] tracking-widest text-muted-foreground">Consensus</TableHead>
                  <TableHead className="w-[120px] font-black uppercase text-[10px] tracking-widest text-muted-foreground">Timelock</TableHead>
                  <TableHead className="w-[120px] font-black uppercase text-[10px] tracking-widest text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const decoded = decodeMethod(tx.data);
                  const isQuorumReached = tx.numConfirmations >= threshold;
                  return (
                    <TableRow key={tx.index} className="border-border/50 hover:bg-primary/5 transition-all duration-200 group">
                      <TableCell className="font-mono text-primary font-bold text-xs">#{tx.index}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${tx.executed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                            {(decoded.name.includes("Signer") || decoded.name.includes("Admin")) ? <UserPlus className="h-4 w-4" /> :
                              decoded.name.includes("Threshold") ? <Settings className="h-4 w-4" /> :
                                decoded.name.includes("Timelock") ? <Clock className="h-4 w-4" /> :
                                  decoded.name.includes("Action") ? <FileText className="h-4 w-4" /> :
                                    <Terminal className="h-4 w-4" />}
                          </div>
                          <span className="font-bold text-sm text-foreground">{decoded.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col space-y-1">
                          <code className="text-[10px] text-muted-foreground truncate max-w-[220px] font-mono bg-muted/30 px-1.5 py-0.5 rounded" title={tx.to}>
                            {tx.to}
                          </code>
                          <div className="flex items-center space-x-2">
                            {tx.value !== "0" && (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-500 border-none font-mono py-0 h-4">
                                {tx.value} wei
                              </Badge>
                            )}
                            {decoded.args.length > 0 && (
                              <span className="text-[10px] text-primary/80 font-bold truncate max-w-[180px]">
                                {decoded.args[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isSingleAdmin ? (
                          <div className="flex flex-col space-y-1.5">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${isQuorumReached ? 'text-emerald-400' : (tx.expired ? 'text-muted-foreground' : 'text-amber-500')}`}>
                              {isQuorumReached ? 'Confirmed' : (tx.expired ? 'Unsettled' : 'Awaiting Sign')}
                            </span>
                            <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden border border-border/5">
                              <div
                                className={`h-full transition-all duration-700 ease-out ${isQuorumReached ? 'bg-emerald-500' : (tx.expired ? 'bg-muted-foreground' : 'bg-amber-500')}`}
                                style={{ width: isQuorumReached ? '100%' : '0%' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-black ${isQuorumReached ? 'text-emerald-400' : (tx.expired ? 'text-muted-foreground' : 'text-foreground')}`}>
                                {tx.expired && !isQuorumReached ? <span className="uppercase tracking-wider">Unsettled</span> : (
                                  <>{tx.numConfirmations} <span className="text-muted-foreground/50">/ {threshold}</span></>
                                )}
                              </span>
                              {isQuorumReached && !tx.executed && !tx.expired && (
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                            </div>
                            <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden border border-border/5">
                              <div
                                className={`h-full transition-all duration-700 ease-out ${isQuorumReached ? 'bg-emerald-500' : (tx.expired ? 'bg-muted-foreground' : 'bg-primary')}`}
                                style={{ width: `${Math.min((tx.numConfirmations / threshold) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.executed || tx.expired ? (
                          <span className="text-[10px] font-black text-muted-foreground uppercase opacity-50">Settled</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {getTimelockInfo(tx).active ? (
                              <>
                                <Clock className="h-3 w-3 text-amber-500 animate-spin-slow" />
                                <span className="text-[10px] font-black text-amber-500 uppercase">{formatRemaining(getTimelockInfo(tx).remaining)}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                <span className="text-[10px] font-black text-emerald-500 uppercase">Ready</span>
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.expired ? (
                          <Badge variant="default" className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase tracking-tighter shadow-none">
                            <Clock className="h-3 w-3 mr-1" /> Expired
                          </Badge>
                        ) : tx.executed ? (
                          <Badge variant="default" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-tighter shadow-none">
                            <CheckCircle className="h-3 w-3 mr-1" /> Executed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-black uppercase tracking-tighter shadow-none">
                            <Clock className="h-3 w-3 mr-1" /> Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleTxClick(tx)}
                          className="h-8 w-8 p-0 hover:bg-primary/20 rounded-full text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>

      <Dialog open={detailsDialog.open} onOpenChange={(open) => setDetailsDialog({ ...detailsDialog, open })}>
        <DialogContent 
          className="max-w-7xl w-[98vw] bg-background border-border shadow-2xl overflow-hidden p-0 rounded-3xl flex flex-col select-none outline-none !opacity-100"
          style={{ maxHeight: 'calc(100vh - 4rem)' }}
        >
          <DialogHeader className="bg-primary/5 p-4 border-b border-border/50 text-left shrink-0">
            <div className="space-y-1.5 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-primary/20 text-primary text-[10px] font-black">TRANSACTION #{detailsDialog.tx?.index}</Badge>
                {detailsDialog.tx?.expired ? (
                  <Badge className="bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase">Expired</Badge>
                ) : detailsDialog.tx?.executed ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase">Finalized</Badge>
                ) : (
                  <Badge className="bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase animate-pulse">Awaiting Approval</Badge>
                )}
              </div>
              <DialogTitle className="sr-only">{decodeMethod(detailsDialog.tx?.data).name}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Review and authorize on-chain protocol actions.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar relative">
            {processing === detailsDialog.tx?.index && !(window as any).ethereum && remoteSessionLink ? (
              <div className="flex flex-col items-center justify-center text-center p-8 py-16 space-y-6 bg-background/95 min-h-[350px]">
                <div className="p-4 bg-primary/10 rounded-full animate-pulse border border-primary/20">
                  <Shield className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold tracking-tight text-foreground">Remote Signing Session Active</h3>
                  <p className="text-muted-foreground text-xs max-w-sm mx-auto leading-relaxed">
                    A secure signing handshake has been established. Please complete the signature authorization in your system web browser.
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <Button
                    variant="outline"
                    className="gap-2.5 w-full h-11 rounded-xl bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:text-primary transition-all font-bold text-xs"
                    onClick={() => {
                      if ((window as any).electronAPI) {
                        (window as any).electronAPI.openExternal(remoteSessionLink);
                      } else {
                        window.open(remoteSessionLink, '_blank');
                      }
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open External Signing Page
                  </Button>
                  <div className="bg-[#07090e] p-2.5 rounded-xl text-[10px] font-mono break-all border border-border/50 text-muted-foreground text-left leading-normal select-text">
                    {remoteSessionLink}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="animate-pulse">Waiting for secure signature from browser...</span>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Left Column - Main Content */}
                <div className="md:col-span-8 space-y-2.5">
                  {/* Target Contract - Full Width */}
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide block mb-2">Target Contract</label>
                    <div className="bg-muted/30 p-3 rounded-xl border border-border/50 flex justify-between items-center group/addr min-w-0">
                      <code className="text-sm font-mono truncate text-foreground pr-2 selectable">{detailsDialog.tx?.to}</code>
                      <a
                        href={`https://testnet.bscscan.com/address/${detailsDialog.tx?.to}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/70 opacity-0 group-hover/addr:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  {/* Value & Proposed On - 2 Columns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide block mb-2">Value</label>
                      <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                        <span className="text-sm font-medium text-foreground">{detailsDialog.tx?.value} wei</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide block mb-2">Proposed On</label>
                      <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {new Date(detailsDialog.tx?.submissionTime * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Impact */}
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide block mb-2">Operational Impact</label>
                    <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 flex items-start gap-2.5">
                      <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm font-normal text-foreground leading-relaxed italic">
                        "{getImpactMessage(detailsDialog.tx?.data)}"
                      </p>
                    </div>
                  </div>

                  {/* Functional Parameters */}
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide block mb-2">Functional Parameters</label>
                    <div className="space-y-2">
                      {(() => {
                        const decoded = decodeMethod(detailsDialog.tx?.data);
                        return decoded.args.map((arg, i) => (
                          <div key={i} className="flex flex-col space-y-1.5 bg-muted/20 p-3 rounded-xl border border-border/30 group/arg hover:bg-muted/30 transition-colors">
                            <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                              {decoded.inputs[i] || `Param ${i}`}
                            </span>
                            <code className="text-sm font-mono text-foreground break-all selectable">{arg}</code>
                          </div>
                        ));
                      })()}
                      {decodeMethod(detailsDialog.tx?.data).args.length === 0 && (
                        <div className="bg-muted/20 p-3 rounded-xl border border-border/30">
                          <span className="text-sm text-muted-foreground italic">No encoded parameters for this call.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* View Raw - Collapsible */}
                  <div>
                    <details className="group">
                      <summary className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest cursor-pointer list-none flex items-center hover:text-muted-foreground transition-colors">
                        <ChevronRight className="h-3 w-3 mr-1 group-open:rotate-90 transition-transform" />
                        View Raw Technical Data
                      </summary>
                      <div className="mt-2 bg-black/20 p-3 rounded-xl border border-border/10">
                        <code className="text-[9px] font-mono text-muted-foreground break-all leading-relaxed">
                          {detailsDialog.tx?.data}
                        </code>
                      </div>
                    </details>
                  </div>
                </div>

                {/* Right Sidebar - Signer Consensus */}
                <div className="md:col-span-4">
                  <div className="md:sticky md:top-0">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Signer Consensus</label>
                    <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-muted-foreground">Collected</span>
                        {isSingleAdmin ? (
                          <span className={`text-xs font-black uppercase tracking-wider ${detailsDialog.tx?.numConfirmations >= threshold ? 'text-emerald-400' : 'text-amber-500'}`}>
                            {detailsDialog.tx?.numConfirmations >= threshold ? 'Authoritative' : 'Awaiting Sign'}
                          </span>
                        ) : (
                          <span className="text-lg font-black text-foreground">
                            {detailsDialog.tx?.numConfirmations} / {threshold}
                          </span>
                        )}
                      </div>
                      <div className="w-full h-2.5 bg-background/50 rounded-full overflow-hidden border border-border/10">
                        <div
                          className={`h-full transition-all duration-1000 ease-in-out ${isSingleAdmin && detailsDialog.tx?.numConfirmations < threshold ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${(detailsDialog.tx?.numConfirmations / threshold) * 100}%` }}
                        />
                      </div>

                      <div className="pt-1 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                        {detailsDialog.tx?.confirmations?.filter((conf: any) => !detailsDialog.tx?.executed || conf.confirmed).map((conf: any, i: number) => {
                          const name = signerNames[conf.address.toLowerCase()] || "Genesis Administrator";
                          return (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-background/30 p-2 rounded-lg gap-2">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-bold text-foreground truncate">{name}</span>
                                <code className="text-muted-foreground/60 text-[9px] font-mono truncate selectable" title={conf.address}>
                                  {conf.address.slice(0, 10)}...{conf.address.slice(-8)}
                                </code>
                              </div>
                              {conf.confirmed ? (
                                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Clock className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-muted/50 border-t border-border flex justify-end items-center shrink-0">
            <div className="flex space-x-3">
              {processing === detailsDialog.tx?.index && !(window as any).ethereum && remoteSessionLink ? (
                <Button
                  variant="ghost"
                  onClick={() => setProcessing(null)}
                  className="rounded-xl px-6 h-12 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel Handshake
                </Button>
              ) : (
                !detailsDialog.tx?.executed && (
                  <>
                    {userAddress && detailsDialog.tx?.confirmations?.some((c: any) => c.address.toLowerCase() === userAddress && c.confirmed) ? (
                      <Button
                        variant="outline"
                        onClick={revokeAction}
                        disabled={processing === detailsDialog.tx?.index}
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10 font-black rounded-xl px-6 h-12"
                      >
                        {processing === detailsDialog.tx?.index ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Revoke Signature"
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={confirmAction}
                        disabled={processing === detailsDialog.tx?.index}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 font-black rounded-xl px-6 h-12 shadow-lg shadow-black/20 group"
                      >
                        {processing === detailsDialog.tx?.index ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {/* @ts-ignore */}
                            {!window.ethereum && <span className="text-xs">Remote Signing...</span>}
                          </div>
                        ) : (
                          <>
                            Approve Transaction <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </Button>
                    )}

                    {detailsDialog.tx?.numConfirmations >= threshold && !detailsDialog.tx?.expired && !detailsDialog.tx?.executed && (
                      <Button
                        onClick={executeAction}
                        disabled={processing === detailsDialog.tx?.index || getTimelockInfo(detailsDialog.tx).active}
                        className={`font-black rounded-xl px-6 h-12 shadow-lg transition-all ${getTimelockInfo(detailsDialog.tx).active ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'}`}
                      >
                        {processing === detailsDialog.tx?.index ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          getTimelockInfo(detailsDialog.tx).active ? (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              Timelock: {formatRemaining(getTimelockInfo(detailsDialog.tx).remaining)}
                            </div>
                          ) : (
                            "Execute On-Chain"
                          )
                        )}
                      </Button>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
