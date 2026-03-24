"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileText, X } from "lucide-react"
import { tokenOptions } from "@/lib/mock-data"
import { motion, AnimatePresence } from "framer-motion"

export function UploadInterface() {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [documentTitle, setDocumentTitle] = useState("")
  const [selectedTokens, setSelectedTokens] = useState("")
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const droppedFiles = Array.from(e.dataTransfer.files)
      const validFiles = droppedFiles.filter((file) => {
        const isValidType = file.type === "application/pdf" || file.type.startsWith("image/jpeg")
        if (!isValidType) {
          toast({
            title: "Invalid File Type",
            description: `${file.name} is not a supported file type. Only PDF and JPEG files are allowed.`,
            variant: "destructive",
          })
        }
        return isValidType
      })

      setFiles((prev) => [...prev, ...validFiles])
    },
    [toast],
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      const validFiles = selectedFiles.filter((file) => {
        const isValidType = file.type === "application/pdf" || file.type.startsWith("image/jpeg")
        if (!isValidType) {
          toast({
            title: "Invalid File Type",
            description: `${file.name} is not a supported file type. Only PDF and JPEG files are allowed.`,
            variant: "destructive",
          })
        }
        return isValidType
      })
      setFiles((prev) => [...prev, ...validFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one file to upload.",
        variant: "destructive",
      })
      return
    }

    if (!documentTitle.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a document title.",
        variant: "destructive",
      })
      return
    }

    if (!selectedTokens) {
      toast({
        title: "Token Selection Required",
        description: "Please select the number of tokens for this notarization.",
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    // Mock upload process
    setTimeout(() => {
      const mockHash = "0x" + Math.random().toString(16).substr(2, 64)
      setIsUploading(false)
      toast({
        title: "Upload Successful",
        description: `Document uploaded successfully. Blockchain hash: ${mockHash.substring(0, 20)}...`,
      })
      router.push("/dashboard")
    }, 3000)
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Card className="overflow-hidden">
        <CardHeader>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>
              Drag and drop your files or click to browse. Only PDF and JPEG files are supported.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-6">
          <motion.div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 relative overflow-hidden ${
              dragActive
                ? "border-primary bg-primary/5 scale-105"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            whileHover={{
              scale: 1.02,
              boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
            }}
            animate={{
              scale: dragActive ? 1.05 : 1,
              rotateX: dragActive ? 5 : 0,
            }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5"
              initial={{ opacity: 0 }}
              animate={{ opacity: dragActive ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            />

            <motion.div
              animate={{
                y: dragActive ? [0, -10, 0] : [0, -5, 0],
                rotate: dragActive ? [0, 5, -5, 0] : 0,
              }}
              transition={{
                y: { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
                rotate: { duration: 0.5 },
              }}
              className="relative z-10"
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            </motion.div>

            <div className="space-y-2 relative z-10">
              <motion.p className="text-lg font-medium" animate={{ scale: dragActive ? 1.05 : 1 }}>
                Drop files here or click to browse
              </motion.p>
              <p className="text-sm text-muted-foreground">Supports PDF and JPEG files up to 10MB each</p>
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />

            {dragActive && (
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-primary/30 rounded-full"
                    style={{
                      left: `${20 + i * 15}%`,
                      top: `${30 + (i % 2) * 40}%`,
                    }}
                    animate={{
                      y: [0, -20, 0],
                      opacity: [0.3, 0.8, 0.3],
                      scale: [1, 1.5, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            )}
          </motion.div>

          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Label>Selected Files</Label>
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <motion.div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      initial={{ opacity: 0, x: -20, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 20, scale: 0.9 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      whileHover={{
                        scale: 1.02,
                        backgroundColor: "rgba(25, 118, 210, 0.05)",
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                        >
                          <FileText className="h-5 w-5 text-primary" />
                        </motion.div>
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="Enter a descriptive title for your document"
                required
              />
            </motion.div>

            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Label htmlFor="tokens">Token Selection</Label>
              <Select value={selectedTokens} onValueChange={setSelectedTokens} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select token amount for notarization" />
                </SelectTrigger>
                <SelectContent>
                  {tokenOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button type="submit" className="w-full relative overflow-hidden" disabled={isUploading}>
                <AnimatePresence mode="wait">
                  {isUploading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center space-x-2"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Uploading...</span>
                    </motion.div>
                  ) : (
                    <motion.span key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      Submit for Notarization
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          </motion.form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
