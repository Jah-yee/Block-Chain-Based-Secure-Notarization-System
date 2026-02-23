import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { Card, CardContent } from "@/components/ui/card"
import { Shield } from "lucide-react"

// Must be async Server Component to read searchParams
export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string }
}) {
  const callbackUrl = searchParams?.callbackUrl

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
          <p className="text-muted-foreground mt-2">
            {callbackUrl
              ? "Sign in to authorize your desktop session"
              : "Sign in to access your account"}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Suspense fallback={null}>
              <LoginForm callbackUrl={callbackUrl} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
