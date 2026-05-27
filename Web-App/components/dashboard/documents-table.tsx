"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Download, Loader2, FileText, ShieldCheck, Copy, ExternalLink, CheckCircle } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import { normalizeStatus, getDisplayStatus } from "@/lib/status-utils"
import { generateCertificatePDF } from "@/lib/pdf-utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Document {
  id: string
  filename: string
  title?: string
  status: "verified" | "pending" | "rejected" | "approved"
  submission_state?: string
  chain_confirmed?: boolean
  approval_tx_hash?: string | null
  created_at: string
  ntkr_sent: number
  file_hash: string
}

interface CertificateData {
  document_id: number
  filename: string
  title: string
  file_hash: string
  submission_state: string
  chain_confirmed: boolean
  approval_tx_hash: string | null
  notarized_at: string
  notary_wallet: string | null
  notary_name: string | null
  contract_address: string
  chain_id: number
  block_explorer_url: string | null
  contract_explorer_url: string
  owner_wallet?: string
}

// ─── Certificate Dialog ────────────────────────────────────────────────────────
function CertificateDialog({ doc }: { doc: Document }) {
  const [open, setOpen] = useState(false)
  const [cert, setCert] = useState<CertificateData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadCert = async () => {
    if (cert) return // already loaded
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.get(`/api/documents/${doc.id}/certificate`)
      setCert(data)
    } catch (err: any) {
      setError(err.message || "Failed to load certificate")
    } finally {
      setLoading(false)
    }
  }

  const copy = (value: string, key: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const trunc = (s: string, h = 10, t = 8) => s ? `${s.slice(0, h)}...${s.slice(-t)}` : "N/A"

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) loadCert() }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          title="View Notarization Certificate"
        >
          <ShieldCheck className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Notarization Certificate
          </DialogTitle>
          <DialogDescription>
            Blockchain-verified proof of notarization for this document.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading certificate...</span>
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {cert && !loading && (
          <div className="space-y-4 py-2">
            {/* Status */}
            <div className="flex justify-center">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                cert.chain_confirmed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${!cert.chain_confirmed ? 'animate-pulse' : ''}`} />
                {cert.chain_confirmed ? "Confirmed On-Chain" : "Processing Transaction..."}
              </span>
            </div>

            {/* Document */}
            <div className="rounded-lg border bg-muted/40 divide-y text-sm">
              <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                <span className="text-muted-foreground shrink-0 font-medium">Document</span>
                <span className="font-medium truncate text-right">{cert.title || cert.filename}</span>
              </div>
              <div className="flex justify-between items-start px-4 py-2.5 gap-4">
                <span className="text-muted-foreground shrink-0 font-medium">File Hash</span>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono text-right">{trunc(cert.file_hash, 12, 10)}</code>
                  <button onClick={() => copy(cert.file_hash, "hash")} className="text-muted-foreground hover:text-foreground">
                    {copied === "hash" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* On-Chain Proof */}
            <div className="rounded-lg border bg-muted/40 divide-y text-sm">
              <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                <span className="text-muted-foreground shrink-0 font-medium">Tx Hash</span>
                <div className="flex items-center gap-1.5">
                  {cert.approval_tx_hash ? (
                    <>
                      <code className="text-xs font-mono">{trunc(cert.approval_tx_hash, 12, 10)}</code>
                      <button onClick={() => copy(cert.approval_tx_hash!, "tx")} className="text-muted-foreground hover:text-foreground">
                        {copied === "tx" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  ) : cert.chain_confirmed ? (
                    <span className="text-xs text-muted-foreground italic">Confirmed (ID Unavailable)</span>
                  ) : (
                    <span className="text-xs text-yellow-600 animate-pulse">Processing...</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                <span className="text-muted-foreground shrink-0 font-medium">Registry</span>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono">{trunc(cert.contract_address, 10, 8)}</code>
                  <button onClick={() => copy(cert.contract_address, "contract")} className="text-muted-foreground hover:text-foreground">
                    {copied === "contract" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                <span className="text-muted-foreground shrink-0 font-medium">Network</span>
                <span className="text-xs">BSC {cert.chain_id === 56 ? "Mainnet" : "Testnet"} ({cert.chain_id})</span>
              </div>
            </div>

            {/* Notary */}
            {cert.notary_wallet && (
              <div className="rounded-lg border bg-muted/40 divide-y text-sm">
                {cert.notary_name && (
                  <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                    <span className="text-muted-foreground shrink-0 font-medium">Notary</span>
                    <span className="text-xs font-medium">{cert.notary_name}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                  <span className="text-muted-foreground shrink-0 font-medium">Wallet</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs font-mono">{trunc(cert.notary_wallet, 10, 8)}</code>
                    <button onClick={() => copy(cert.notary_wallet!, "notary")} className="text-muted-foreground hover:text-foreground">
                      {copied === "notary" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 gap-4">
                  <span className="text-muted-foreground shrink-0 font-medium">Notarized</span>
                  <span className="text-xs">{cert.notarized_at ? new Date(cert.notarized_at).toLocaleString() : "N/A"}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              {cert.block_explorer_url && (
                <a
                  href={cert.block_explorer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Verify on BscScan
                </a>
              )}
              <a
                href={cert.contract_explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full border hover:bg-muted text-foreground font-medium py-2 rounded-lg text-sm transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Registry Contract
              </a>
              {cert.chain_confirmed && (
                <button
                  onClick={async () => {
                    try {
                      // toast is not accessible directly here without useToast, but we can just use console or a simple alert, 
                      // Wait, we have access to cert.filename. Let's just generate it.
                      let ownerWalletStr = "";
                      try {
                          const storedUser = localStorage.getItem('bbsns_user');
                          if (storedUser) {
                              const parsed = JSON.parse(storedUser);
                              if (parsed.wallet_address) ownerWalletStr = parsed.wallet_address;
                          }
                      } catch (e) {}

                      await generateCertificatePDF({
                          filename: cert.title || cert.filename,
                          fileHash: cert.file_hash,
                          status: "APPROVED",
                          txHash: cert.approval_tx_hash || undefined,
                          notaryWallet: cert.notary_wallet || "System Assigned Notary",
                          notaryName: cert.notary_name || undefined,
                          ownerWallet: cert.owner_wallet || ownerWalletStr,
                          timestamp: cert.notarized_at,
                          contractAddress: cert.contract_address,
                          chainId: cert.chain_id,
                          verificationUrl: `https://app.bbsns.online/verify?hash=${cert.file_hash}`,
                      });
                    } catch (e) {
                      console.error("Failed to generate PDF", e);
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-sm transition-colors mt-2 border border-emerald-500 shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  Download Certificate PDF
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Table ────────────────────────────────────────────────────────────────
export function DocumentsTable() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const fetchDocuments = async () => {
    try {
      const data = await apiClient.get('/api/documents')
      const rawDocs = data || []
      
      // [NORMALIZE ONCE] Force all documents to Backend Authority tokens
      const normalizedDocs = rawDocs.map((doc: any) => ({
        ...doc,
        status: normalizeStatus(doc.status)
      }))
      
      setDocuments(normalizedDocs)
    } catch (err: any) {
      console.error("Failed to fetch documents:", err)
      // Silently handle errors for document fetching to prevent unwanted toasts for users with no records
      setDocuments([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const getStatusColor = (status: string) => {
    const s = normalizeStatus(status);
    switch (s) {
      case "KYC_VERIFIED":
      case "APPROVED":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "REJECTED":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  // A document is notarized (and eligible for a certificate) when it's approved/completed on chain
  const isNotarized = (doc: Document) => {
    const s = normalizeStatus(doc.status)
    return s === "APPROVED" || s === "KYC_VERIFIED" ||
      doc.chain_confirmed === true ||
      doc.submission_state === "completed" ||
      doc.submission_state === "submitted_to_blockchain"
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 border rounded-lg bg-background/50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Fetching authoritative document list...</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-background/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>NTKR Fee</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id} className="group transition-colors hover:bg-muted/20">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{doc.title || doc.filename}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(doc.status)}>
                  {getDisplayStatus(doc.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(doc.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">{doc.ntkr_sent || 0} NTKR</span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end space-x-1">
                  {/* Metadata View */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View Metadata">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Document Metadata</DialogTitle>
                        <DialogDescription>
                          Technical details and verification status.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <span className="text-sm font-medium text-right">Filename:</span>
                          <span className="col-span-3 text-sm truncate" title={doc.filename}>{doc.filename}</span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <span className="text-sm font-medium text-right">Status:</span>
                          <span className="col-span-3">
                            <Badge className={getStatusColor(doc.status)}>
                              {getDisplayStatus(doc.status)}
                            </Badge>
                          </span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <span className="text-sm font-medium text-right">Created:</span>
                          <span className="col-span-3 text-sm">
                            {new Date(doc.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <span className="text-sm font-medium text-right">Fee:</span>
                          <span className="col-span-3 text-sm font-mono">{doc.ntkr_sent || 0} NTKR</span>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                          <span className="text-sm font-medium text-right mt-1">Hash:</span>
                          <div className="col-span-3 p-2 bg-muted rounded-md break-all text-xs font-mono select-all">
                            {doc.file_hash}
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Certificate View — only for notarized documents */}
                  {isNotarized(doc) && <CertificateDialog doc={doc} />}

                  {/* Download */}
                   <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Download File"
                    onClick={async () => {
                      // Hardened Phase 3: Direct Navigation Redirect
                      window.location.href = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/documents/${doc.id}/file`;
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {documents.length === 0 && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No documents yet</p>
            <p className="text-xs text-muted-foreground max-w-md">
              Upload your first document to get started with blockchain-verified notarization.
              Your notarization history will appear here once you submit documents.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

