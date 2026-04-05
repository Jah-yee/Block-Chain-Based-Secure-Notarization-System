"use client"

import { UploadInterface } from "../../../components/dashboard/upload-interface"

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Upload Document</h1>
        <p className="text-muted-foreground">Submit your documents for blockchain notarization</p>
      </div>

      <UploadInterface />
    </div>
  )
}
