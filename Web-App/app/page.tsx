"use client"

import { useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { Footer } from "@/components/footer"

function HomeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const mode = searchParams.get("mode")
    const sessionId = searchParams.get("sessionId")

    if (mode && sessionId) {
      console.log(`[ROUTE] Redirecting remote session: ${mode}`);
      if (mode === "gov-submit" || mode === "gov-vote") {
        router.push(`/governance/remote-sign?sessionId=${sessionId}`)
      } else if (mode === "notarize") {
        router.push(`/auth/remote-login?sessionId=${sessionId}`)
      }
    }
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}
