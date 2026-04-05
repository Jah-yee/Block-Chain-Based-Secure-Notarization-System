"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Eye, Download, Plus, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useEffect } from "react"
import { apiClient } from "@/lib/api-client"

export function VersioningInterface() {
  const [documents, setDocuments] = useState<any[]>([])
  const [selectedDocument, setSelectedDocument] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const data = await apiClient.get('/api/documents')
        setDocuments(data || [])
      } catch (err) {
        console.error("Failed to fetch documents for versioning:", err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDocs()
  }, [])

  // Map backend documents to the format expected by this mock-up UI
  const documentsWithVersions = documents.map(doc => ({
    id: doc.id,
    title: doc.filename,
    versions: [
      {
        id: `v1-${doc.id}`,
        version: 1,
        uploadDate: doc.created_at,
        status: doc.status,
        hash: doc.file_hash
      }
    ]
  }))

  const selectedDoc = documentsWithVersions.find((doc) => doc.id === selectedDocument)

  const handleUploadNewVersion = () => {
    if (!selectedDocument) {
      toast({
        title: "No Document Selected",
        description: "Please select a document first.",
        variant: "destructive",
      })
      return
    }

    // Create file input element
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf,.jpg,.jpeg"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        toast({
          title: "Version Upload Started",
          description: `Uploading new version of ${selectedDoc?.title}...`,
        })

        // Mock upload process
        setTimeout(() => {
          toast({
            title: "New Version Uploaded",
            description: "Your new document version has been successfully uploaded and is being processed.",
          })
        }, 2000)
      }
    }
    input.click()
  }

  const getStatusColor = (status: string) => {
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
          <CardTitle>Document Selection</CardTitle>
          <CardDescription>Select a document to view and manage its versions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents...
            </div>
          ) : (
            <Select value={selectedDocument} onValueChange={setSelectedDocument}>
              <SelectTrigger>
                <SelectValue placeholder={documents.length > 0 ? "Select a document to view versions" : "No documents available"} />
              </SelectTrigger>
              <SelectContent>
                {documentsWithVersions.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedDoc && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Version History - {selectedDoc.title}</CardTitle>
                <CardDescription>Manage multiple versions of your document</CardDescription>
              </div>
              <Button onClick={handleUploadNewVersion}>
                <Plus className="h-4 w-4 mr-2" />
                Upload New Version
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Upload Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Blockchain Hash</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDoc.versions?.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-medium">v{version.version}</TableCell>
                      <TableCell>{new Date(version.uploadDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(version.status)}>
                          {version.status.charAt(0).toUpperCase() + version.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{version.hash.substring(0, 20)}...</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedDocument && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No Document Selected</p>
            <p className="text-sm text-muted-foreground">Select a document above to view its version history</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
