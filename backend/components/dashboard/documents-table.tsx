"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Download } from "lucide-react"
import { mockDocuments } from "@/lib/mock-data"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"

export function DocumentsTable() {
  const tableRef = useRef(null)
  const isInView = useInView(tableRef, { once: true, margin: "-50px" })

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
    <motion.div
      ref={tableRef}
      className="rounded-md border bg-background/50 backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6 }}
    >
      <Table>
        <TableHeader>
          <motion.tr
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Upload Date</TableHead>
            <TableHead>Token Cost</TableHead>
            <TableHead>Actions</TableHead>
          </motion.tr>
        </TableHeader>
        <TableBody>
          {mockDocuments.map((document, index) => (
            <motion.tr
              key={document.id}
              initial={{
                opacity: 0,
                x: -30,
                scale: 0.95,
              }}
              animate={
                isInView
                  ? {
                      opacity: 1,
                      x: 0,
                      scale: 1,
                    }
                  : {
                      opacity: 0,
                      x: -30,
                      scale: 0.95,
                    }
              }
              transition={{
                duration: 0.5,
                delay: 0.4 + index * 0.1,
                ease: "easeOut",
              }}
              whileHover={{
                scale: 1.02,
                backgroundColor: "rgba(25, 118, 210, 0.05)",
                transition: { duration: 0.2 },
              }}
              className="group cursor-pointer"
            >
              <TableCell className="font-medium">
                <motion.span whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                  {document.title}
                </motion.span>
              </TableCell>
              <TableCell>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  animate={{
                    scale: document.status === "pending" ? [1, 1.05, 1] : 1,
                  }}
                  transition={{
                    scale: {
                      duration: 2,
                      repeat: document.status === "pending" ? Number.POSITIVE_INFINITY : 0,
                      ease: "easeInOut",
                    },
                  }}
                >
                  <Badge className={getStatusColor(document.status)}>
                    {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                  </Badge>
                </motion.div>
              </TableCell>
              <TableCell>
                <motion.span initial={{ opacity: 0.7 }} whileHover={{ opacity: 1 }}>
                  {new Date(document.uploadDate).toLocaleDateString()}
                </motion.span>
              </TableCell>
              <TableCell>
                <motion.span
                  className="font-mono"
                  whileHover={{
                    scale: 1.1,
                    color: "rgb(25, 118, 210)",
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {document.tokenCost} NTKR
                </motion.span>
              </TableCell>
              <TableCell>
                <div className="flex items-center space-x-2">
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-70 group-hover:opacity-100 transition-opacity"
                    >
                      <motion.div whileHover={{ rotate: 15 }} transition={{ duration: 0.2 }}>
                        <Eye className="h-4 w-4" />
                      </motion.div>
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-70 group-hover:opacity-100 transition-opacity"
                    >
                      <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                        <Download className="h-4 w-4" />
                      </motion.div>
                    </Button>
                  </motion.div>
                </div>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>

      {mockDocuments.length === 0 && (
        <motion.div
          className="p-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            className="text-muted-foreground"
          >
            No documents found. Upload your first document to get started.
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
