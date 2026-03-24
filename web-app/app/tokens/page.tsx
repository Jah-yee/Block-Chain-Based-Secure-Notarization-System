"use client"

import { useState } from "react"
import { Copy, CheckCircle2, ShieldAlert, ArrowUpRight, Hexagon, Component } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export default function TokenContractsPage() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const contracts = [
    {
      name: "NTKR Token",
      description: "The primary utility and reputation token for Notaries in the BBSNS ecosystem.",
      address: process.env.NEXT_PUBLIC_NTKR_CONTRACT_ADDRESS || "0x...",
      symbol: "NTKR",
      priority: true,
    },
    {
      name: "NTK Token",
      description: "The base network token used for transactions.",
      address: process.env.NEXT_PUBLIC_NTK_CONTRACT_ADDRESS || "0x...",
      symbol: "NTK",
      priority: false,
    },
    {
      name: "Document Registry",
      description: "Core smart contract storing notarization proofs and signatures.",
      address: process.env.NEXT_PUBLIC_DOCUMENT_REGISTRY_ADDRESS || "0x...",
      symbol: "REGISTRY",
      priority: false,
    }
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden bg-muted/30">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(to_bottom,transparent,black)]" />
          <div className="container relative z-10 mx-auto px-4 text-center">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-6">
              <Component className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
              Official Smart Contracts
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Verify the official contract addresses before executing transactions to ensure your assets are secure.
            </p>
            
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 max-w-2xl mx-auto flex items-start text-left space-x-3">
              <ShieldAlert className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-destructive">Security Warning</h4>
                <p className="text-sm text-foreground/80 mt-1">
                  Frequent deployments on testnets might change these addresses. Always double-check here before importing custom tokens to your wallet or spending funds.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contracts Grid */}
        <section className="py-16 container mx-auto px-4 max-w-5xl">
          <div className="grid gap-8 space-y-4">
            {contracts.map((contract, i) => (
              <div 
                key={i} 
                className={`group relative overflow-hidden rounded-2xl border bg-card transition-all hover:shadow-lg ${
                  contract.priority ? 'ring-2 ring-primary/50 shadow-md transform hover:-translate-y-1' : ''
                }`}
              >
                {contract.priority && (
                  <div className="absolute top-0 right-0 pt-3 pr-4">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      Primary Token
                    </span>
                  </div>
                )}
                <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
                  
                  {/* Icon */}
                  <div className={`shrink-0 h-16 w-16 rounded-2xl flex items-center justify-center ${contract.priority ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    <Hexagon className="h-8 w-8" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-center md:text-left space-y-2">
                    <h2 className="text-2xl font-bold flex items-center justify-center md:justify-start gap-2">
                      {contract.name}
                      <span className="text-sm font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {contract.symbol}
                      </span>
                    </h2>
                    <p className="text-muted-foreground">
                      {contract.description}
                    </p>
                  </div>

                  {/* Address & Actions */}
                  <div className="flex-1 w-full flex flex-col items-center md:items-end space-y-3">
                    <div className="w-full bg-black/5 dark:bg-white/5 border rounded-lg p-3 flex items-center justify-between group-hover:border-primary/50 transition-colors">
                      <code className="text-sm font-mono truncate mr-4 text-foreground/90">
                        {contract.address}
                      </code>
                      <button 
                        onClick={() => handleCopy(contract.address)}
                        className="p-2 -mr-2 text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
                        title="Copy to clipboard"
                        aria-label="Copy address"
                      >
                        {copiedAddress === contract.address ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    
                    <a 
                      href={`https://testnet.bscscan.com/address/${contract.address}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      View on BscScan <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
