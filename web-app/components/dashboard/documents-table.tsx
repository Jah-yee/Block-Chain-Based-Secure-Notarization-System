"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Download, Loader2, FileText } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Document {
  id: string
  filename: string
  status: "verified" | "pending" | "rejected" | "approved"
  created_at: string
  ntkr_sent: number
  file_hash: string
}

export function DocumentsTable() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const fetchDocuments = async () => {
    try {
      const data = await apiClient.get('/api/documents')
      setDocuments(data || [])
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
    switch (status) {
      case "verified":
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
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
                  <span>{doc.filename}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(doc.status)}>
                  {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
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
                              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Download File"
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/documents/${doc.id}/file`, '_blank')}
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
