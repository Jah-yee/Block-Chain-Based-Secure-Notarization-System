"use client"

import { VerificationInterface } from "../../../components/dashboard/verification-interface"

export default function VerificationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Document Verification</h1>
        <p className="text-muted-foreground">Verify the authenticity of notarized documents</p>
      </div>

      <VerificationInterface />
    </div>
  )
}
