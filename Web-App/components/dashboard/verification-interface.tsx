"use client"

import * as React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { Search, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useConfig } from "@/providers/ConfigProvider"
import { connectWallet, signNotarizeAction } from "@/lib/web3"
import { normalizeStatus, getDisplayStatus } from "@/lib/status-utils"

interface VerificationResult {
  id?: string
  isValid: boolean
  documentTitle: string
  uploadDate: string
  status: "verified" | "pending" | "rejected" | "approved"
  hash: string
}

export function VerificationInterface() {
  const { config } = useConfig()
  const { user, balances, isLoading: isSessionLoading, refreshBalances } = useWalletSession()
  const [searchQuery, setSearchQuery] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const { toast } = useToast()

  const ntkBalance = Number(balances?.ntk || 0)
  const canNotarize = (user?.role === 'notary' || user?.role === 'admin') && user?.kyc_verified

  const handleVerification = async () => {
    if (!searchQuery.trim()) {
      toast({ title: "Input Required", description: "Enter a document ID to verify.", variant: "destructive" })
      return
    }

    setIsVerifying(true)
    setVerificationResult(null)

    try {
      const doc = await apiClient.get(`/api/documents/${searchQuery}`)
      setVerificationResult({
        id: doc.id,
        isValid: true,
        documentTitle: doc.filename,
        uploadDate: doc.created_at,
        status: normalizeStatus(doc.status) as any, // [NORMALIZE ONCE]
        hash: doc.file_hash
      })
      toast({ title: "Document Found", description: "Details fetched from authoritative records." })
    } catch (err: any) {
      setVerificationResult({
        isValid: false,
        documentTitle: "Unknown",
        uploadDate: "",
        status: "rejected",
        hash: ""
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleAction = async (newStatus: 'approved' | 'rejected') => {
    if (!verificationResult?.id || !verificationResult?.hash) return

    setIsProcessing(true)
    try {
      // 1. Connect Wallet if needed
      const { signer, chainId } = await connectWallet();

      // 2. Prepare Data
      const timestamp = Math.floor(Date.now() / 1000);
      const statusInt = newStatus === 'approved' ? 1 : 2;
      const registryAddress = config?.contracts.documentRegistry || "";

      if (!registryAddress) {
        throw new Error("Registry contract address not configured in environment.");
      }

      // 3. Request EIP-712 Signature (Hardware/Browser Wallet)
      const signature = await signNotarizeAction(
        signer,
        chainId,
        registryAddress,
        verificationResult.hash,
        statusInt,
        timestamp
      );

      // 4. Relay to Backend
      await apiClient.put(`/api/documents/${verificationResult.id}`, {
        status: newStatus,
        signature,
        timestamp
      });

      toast({ title: `Success`, description: `Document ${newStatus} on-chain with verifiable signature.` })
      await refreshBalances()
      handleVerification()
    } catch (err: any) {
      console.error("[SIGN-ACTION-FAIL]", err);
      toast({
        title: "Action Failed",
        description: err.code === 'ACTION_REJECTED' ? "User rejected signature request." : err.message,
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusIcon = (status: string, isValid: boolean) => {
    if (!isValid) return <XCircle className="h-5 w-5 text-red-500" />
    const s = normalizeStatus(status);
    if (s === "KYC_VERIFIED" || s === "APPROVED") return <CheckCircle className="h-5 w-5 text-green-500" />
    if (s === "PENDING") return <AlertCircle className="h-5 w-5 text-yellow-500" />
    return <XCircle className="h-5 w-5 text-red-500" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify Document</CardTitle>
          <CardDescription>Verify authenticity against the secure ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter Document ID..."
            />
            <Button onClick={handleVerification} disabled={isVerifying}>
              {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {verificationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-sm">
              {getStatusIcon(verificationResult.status, verificationResult.isValid)}
              <span>Result: {verificationResult.documentTitle}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {verificationResult.isValid ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 text-xs">
                  <span className="font-semibold">Status:</span>
                  <Badge variant="outline" className="w-fit">{getDisplayStatus(verificationResult.status)}</Badge>
                </div>
                {normalizeStatus(verificationResult.status) === 'PENDING' && canNotarize && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600"
                      onClick={() => handleAction('approved')}
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleAction('rejected')}
                      disabled={isProcessing}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-destructive">Record not found or invalid hash signature.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
