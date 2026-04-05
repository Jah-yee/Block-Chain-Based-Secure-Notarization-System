import { VersioningInterface } from "@/components/dashboard/versioning-interface"

export default function VersioningPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Document Versioning</h1>
        <p className="text-muted-foreground">Manage multiple versions of your documents</p>
      </div>

      <VersioningInterface />
    </div>
  )
}
