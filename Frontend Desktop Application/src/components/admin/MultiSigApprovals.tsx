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
  } catch (e) {
    return { name: "Unknown Operation", args: [data.slice(0, 10) + "..."], inputs: [] };
  }
}

function getImpactMessage(data: string) {
  const method = decodeMethod(data);
  switch (method.name) {
    case "add Signer":
      return `This will grant administrative powers to ${method.args[0]}. They will be able to propose and sign protocol changes.`;
    case "remove Signer":
      return `This will revoke administrative powers from ${method.args[0]}. They will no longer be able to authorize protocol actions.`;
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractAddress, setContractAddress] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [processing, setProcessing] = useState<number | null>(null);

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
      setTransactions(txArray);
      setContractAddress(res?.address || "");
      setThreshold(res?.threshold || 2);
      setTimelockDelay(res?.timelockDelay || 0);

      // If dialog is open, update the active tx data
      if (detailsDialog.open && detailsDialog.tx) {
        const updatedTx = txArray.find((t: any) => t.index === detailsDialog.tx.index);
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
        const { config } = useConfig();
        const link = `${config?.webAppUrl}/governance/multisig/remote-confirm?sessionId=${session.sessionId}`;
        setRemoteSessionLink(link);

        // Open automatically if possible
        window.open(link, '_blank');

        // Poll for completion
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await api.checkRemoteMultiSigStatus(session.sessionId);
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
            // ignore polling errors
          }
        }, 2000);

        // Stop polling after 10 minutes (safety)
        setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
        return;
      }

      // --- LOCAL METAMASK FLOW ---
      // @ts-ignore
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const wallet = accounts[0];

      // EIP-712 Domain
      // @ts-ignore
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      const domain = {
        name: "BBSNS_Protocol",
        version: "2",
        chainId: parseInt(chainId, 16),
        verifyingContract: contractAddress,
      };

      const types = {
        Confirm: [
          { name: "txIndex", type: "uint256" },
          { name: "version", type: "uint256" },
        ],
      };

      const value = {
        txIndex: tx.index,
        version: tx.signerVersion,
      };

      // @ts-ignore
      const signature = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [wallet, JSON.stringify({ domain, types, primaryType: "Confirm", message: value })],
      });

      await api.confirmMultiSigApprove(tx.index, signature);
      toast.success("Confirmation submitted successfully!");
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
    if (!detailsDialog.tx) return;
    const tx = detailsDialog.tx;

    // Safety check for timelock
    const { active, remaining } = getTimelockInfo(tx);
    if (active) {
      toast.error(`Timelock active. Please wait ${formatRemaining(remaining)}.`);
      return;
    }

    setProcessing(tx.index);
    try {
      await api.executeMultiSigTransaction(tx.index);
      toast.success("Transaction execution triggered!");
      setDetailsDialog({ open: false, tx: null });
      loadTransactions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to execute transaction");
    } finally {
      setProcessing(null);
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
    <div className="flex-1 flex flex-col min-h-0 h-full bg-[#07090e] overflow-hidden">
      {/* Header */}
      <div className="flex-none p-8 pt-12 pb-8 border-b border-white/5 bg-[#07090e]">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">CONSENSUS VAULT</h1>
            <p className="text-sm text-slate-400 font-medium italic uppercase tracking-widest">Protocol Control Center • Multi-Sig Authority</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTransactions} disabled={loading} className="rounded-xl px-6 h-11 border-white/10 hover:bg-white/5 text-[10px] font-black tracking-widest text-slate-400 hover:text-white transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "REFRESH STATE"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="p-8 pb-32">
        {loading && transactions.length === 0 ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-border rounded-xl bg-muted/20">
            <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
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
                            {decoded.name.includes("Signer") ? <UserPlus className="h-4 w-4" /> :
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
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-black ${isQuorumReached ? 'text-emerald-400' : 'text-foreground'}`}>
                              {tx.numConfirmations} <span className="text-muted-foreground/50">/ {threshold}</span>
                            </span>
                            {isQuorumReached && !tx.executed && (
                              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden border border-border/5">
                            <div
                              className={`h-full transition-all duration-700 ease-out ${isQuorumReached ? 'bg-emerald-500' : 'bg-primary'}`}
                              style={{ width: `${Math.min((tx.numConfirmations / threshold) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tx.executed ? (
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
                        {tx.executed ? (
                          <Badge variant="default" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase tracking-tighter shadow-none">
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
        <DialogContent className="max-w-7xl w-[98vw] bg-card border-border shadow-2xl overflow-hidden p-0 rounded-3xl flex flex-col max-h-[65vh] select-none outline-none">
          <DialogHeader className="bg-primary/5 p-4 border-b border-border/50 text-left">
            <div className="space-y-1.5 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-primary/20 text-primary text-[10px] font-black">TRANSACTION #{detailsDialog.tx?.index}</Badge>
                {detailsDialog.tx?.executed ? (
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

          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
            {/* Remote Signing Overlay */}
            {processing === detailsDialog.tx?.index && !(window as any).ethereum && remoteSessionLink && (
              <div className="absolute inset-0 bg-background/95 backdrop-blur z-50 flex flex-col items-center justify-center text-center p-8 space-y-6">
                <div className="p-4 bg-primary/10 rounded-full animate-pulse">
                  <Shield className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Remote Signing Session Active</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Please complete the signature process in your web browser.
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <Button
                    variant="outline"
                    className="gap-2 w-full"
                    onClick={() => window.open(remoteSessionLink, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" /> Open Signing Page
                  </Button>
                  <div className="bg-muted p-2 rounded text-[10px] font-mono break-all border border-border/50 text-muted-foreground">
                    {remoteSessionLink}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground/50 animate-pulse">
                  Waiting for signature...
                </p>
              </div>
            )}

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
                        <span className="text-lg font-black text-foreground">
                          {detailsDialog.tx?.numConfirmations} / {threshold}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-background/50 rounded-full overflow-hidden border border-border/10">
                        <div
                          className="h-full bg-primary transition-all duration-1000 ease-in-out"
                          style={{ width: `${(detailsDialog.tx?.numConfirmations / threshold) * 100}%` }}
                        />
                      </div>

                      <div className="pt-1 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                        {detailsDialog.tx?.confirmations?.map((conf: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-[11px] bg-background/30 p-2 rounded-lg">
                            <code className="text-muted-foreground truncate flex-1 mr-2 selectable" title={conf.address}>
                              {conf.address.slice(0, 10)}...{conf.address.slice(-8)}
                            </code>
                            {conf.confirmed ? (
                              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-muted/50 border-t border-border flex justify-end items-center">
            <div className="flex space-x-3">
              {!detailsDialog.tx?.executed && (
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
                      className="bg-foreground text-background hover:bg-foreground/90 font-black rounded-xl px-6 h-12 shadow-lg shadow-black/20 group"
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

                  {detailsDialog.tx?.numConfirmations >= threshold && (
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
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
