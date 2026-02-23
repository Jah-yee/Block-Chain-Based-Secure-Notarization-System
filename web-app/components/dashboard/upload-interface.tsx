"use client"

import * as React from "react"
import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileText, X, AlertCircle, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { cn } from "@/lib/utils"

export function UploadInterface() {
  const { balances, liveBalances, isLoading: isSessionLoading, refreshBalances, user, connectedAccount } = useWalletSession()
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [documentTitle, setDocumentTitle] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    const valid = droppedFiles.filter(f => f.type === "application/pdf" || f.type.startsWith("image/"))
    setFiles(prev => [...prev, ...valid])
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const valid = Array.from(e.target.files).filter(f => f.type === "application/pdf" || f.type.startsWith("image/"))
      setFiles(prev => [...prev, ...valid])
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0 || !documentTitle.trim()) {
      toast({ title: "Required", description: "Title and file are mandatory.", variant: "destructive" })
      return
    }

    setIsUploading(true)
    try {
      // 🔐 SIGNATURE REQUEST
      if (!window.ethereum || !connectedAccount) {
        toast({
          title: "Wallet Required",
          description: "Please connect your wallet to authorize this upload.",
          variant: "destructive"
        });
        setIsUploading(false);
        return;
      }

      const timestamp = Date.now().toString();
      const ntkrCost = selectedCategory === 1 ? '5' : '1';
      const message = `Authorize Upload\nCost: ${ntkrCost} NTKR\nCategory: ${selectedCategory}\nTimestamp: ${timestamp}`;

      let signature;
      try {
        toast({
          title: "Authorization Required",
          description: "Please sign the message in your wallet to confirm NTKR spending.",
        });

        // Use standard Ethereum provider request
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, connectedAccount],
        });
      } catch (signErr) {
        console.error("Signature denied:", signErr);
        toast({
          title: "Authorization Cancelled",
          description: "Upload cancelled because you declined to sign.",
          variant: "destructive"
        });
        setIsUploading(false);
        return;
      }

      const formData = new FormData()
      formData.append('file', files[0])
      formData.append('filename', documentTitle)
      formData.append('category', selectedCategory.toString())
      formData.append('signature', signature)
      formData.append('timestamp', timestamp)

      await apiClient.post('/api/documents', formData)

      toast({ title: "Upload Successful", description: "Document sent for server-side processing." })
      await refreshBalances()
      router.push("/dashboard/documents")
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" })
    } finally {
      setIsUploading(false)
    }
  }

  const requiredTokens = selectedCategory === 0 ? 1 : 5
  // Check against LIVE balance if available, otherwise fallback to cached backend balance
  const currentNtkr = liveBalances.isLive ? Number(liveBalances.ntkr || 0) : Number(balances?.ntkr || 0)
  const hasInsufficientTokens = currentNtkr < requiredTokens

  const walletMismatch = Boolean(connectedAccount && user?.wallet_address &&
    connectedAccount.toLowerCase() !== user.wallet_address.toLowerCase())

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Submit Document</CardTitle>
          <CardDescription>
            Documents are hashed and recorded by the server for maximum integrity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <label
            className={cn(
              "relative block border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer",
              dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-800 hover:border-slate-700 hover:bg-white/[0.02]"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-4" />
            <div className="space-y-1">
              <p className="font-semibold text-sm text-slate-200">Drop file or click to browse</p>
              <p className="text-xs text-slate-500">PDF, JPG, PNG up to 10MB</p>
            </div>
            <input
              type="file"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Selected File</Label>
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(i)} className="h-6 w-6">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase">Category</Label>
                <Select value={selectedCategory.toString()} onValueChange={(v) => setSelectedCategory(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Basic Notarization (1 NTKR)</SelectItem>
                    <SelectItem value="1">Official Review (5 NTKR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase">Title</Label>
                <Input value={documentTitle} onChange={e => setDocumentTitle(e.target.value)} placeholder="e.g. Property Deed 2024" />
              </div>
            </div>

            {hasInsufficientTokens && (
              <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">
                <AlertCircle className="h-4 w-4" />
                <p>Insufficient NTKR Balance. You need {requiredTokens} tokens.</p>
              </div>
            )}

            {walletMismatch && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded border border-destructive/20 border-l-4 border-l-destructive">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-semibold">Wrong Wallet Connected</p>
                  <p className="text-xs">
                    You are logged in as {user?.wallet_address?.slice(0, 6)}...{user?.wallet_address?.slice(-4)},
                    but your wallet is connected to {connectedAccount?.slice(0, 6)}...{connectedAccount?.slice(-4)}.
                  </p>
                  <p className="text-xs font-semibold mt-1">Please switch accounts in your wallet extension.</p>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isUploading || hasInsufficientTokens || files.length === 0 || walletMismatch}>
              {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : "Submit to Ledger"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


