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
    // 🛡️ [CONSOLIDATION] Remote auth logic migrated to auth.bbsns.online
    // No legacy redirects needed in Web-App home content.
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
