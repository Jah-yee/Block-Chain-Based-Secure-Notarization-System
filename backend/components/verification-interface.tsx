"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Search, CheckCircle, XCircle, AlertCircle } from "lucide-react"

interface VerificationResult {
  isValid: boolean
  documentTitle: string
  uploadDate: string
  status: "verified" | "pending" | "rejected"
  hash: string
}

export function VerificationInterface() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const { toast } = useToast()

  const handleVerification = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a document hash or ID to verify.",
        variant: "destructive",
      })
      return
    }

    setIsVerifying(true)
    setVerificationResult(null)

    // Mock verification process
    setTimeout(() => {
      // Simulate different verification results
      const mockResults: VerificationResult[] = [
        {
          isValid: true,
          documentTitle: "Contract Agreement.pdf",
          uploadDate: "2024-01-15",
          status: "verified",
          hash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
        },
        {
          isValid: true,
          documentTitle: "Property Deed.pdf",
          uploadDate: "2024-01-20",
          status: "pending",
          hash: "0xefgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678",
        },
        {
          isValid: false,
          documentTitle: "Unknown Document",
          uploadDate: "",
          status: "rejected",
          hash: "",
        },
      ]

      const result = searchQuery.includes("abcd")
        ? mockResults[0]
        : searchQuery.includes("efgh")
          ? mockResults[1]
          : mockResults[2]

      setVerificationResult(result)
      setIsVerifying(false)

      if (result.isValid) {
        toast({
          title: "Verification Complete",
          description: "Document verification has been completed successfully.",
        })
      } else {
        toast({
          title: "Verification Failed",
          description: "The provided hash or ID could not be verified.",
          variant: "destructive",
        })
      }
    }, 2000)
  }

  const getStatusIcon = (status: string, isValid: boolean) => {
    if (!isValid) return <XCircle className="h-5 w-5 text-red-500" />

    switch (status) {
      case "verified":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "pending":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case "rejected":
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string, isValid: boolean) => {
    if (!isValid) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"

    switch (status) {
      case "verified":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify Document</CardTitle>
          <CardDescription>Enter a document hash or ID to verify its authenticity on the blockchain</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">Document Hash or ID</Label>
            <div className="flex space-x-2">
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter blockchain hash or document ID..."
                className="flex-1"
              />
              <Button onClick={handleVerification} disabled={isVerifying}>
                <Search className="h-4 w-4 mr-2" />
                {isVerifying ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Example hashes to try:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <code className="bg-muted px-1 rounded">0xabcd1234...</code> (Verified document)
              </li>
              <li>
                <code className="bg-muted px-1 rounded">0xefgh5678...</code> (Pending document)
              </li>
              <li>
                <code className="bg-muted px-1 rounded">invalid-hash</code> (Invalid document)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {verificationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {getStatusIcon(verificationResult.status, verificationResult.isValid)}
              <span>Verification Result</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {verificationResult.isValid ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Document Title:</span>
                  <span className="text-sm">{verificationResult.documentTitle}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Upload Date:</span>
                  <span className="text-sm">{new Date(verificationResult.uploadDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge className={getStatusColor(verificationResult.status, verificationResult.isValid)}>
                    {verificationResult.status.charAt(0).toUpperCase() + verificationResult.status.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Blockchain Hash:</span>
                  <span className="text-sm font-mono">{verificationResult.hash.substring(0, 20)}...</span>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    ✓ This document has been successfully verified on the blockchain and is authentic.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-800 dark:text-red-300">
                  ✗ The provided hash or ID could not be verified. This document may not exist on the blockchain or the
                  hash is invalid.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
