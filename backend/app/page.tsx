import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { Footer } from "@/components/footer"
import { NotaryApplicationDialog } from "@/components/notary-application-dialog"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
      </main>
      <Footer />
      <NotaryApplicationDialog />
    </div>
  )
}
