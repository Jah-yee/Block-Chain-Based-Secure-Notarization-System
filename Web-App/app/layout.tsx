import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/react"
import { ThemeProvider } from "@/components/theme-provider"
import { WalletProvider } from "@/hooks/use-wallet-session"
import { Toaster } from "@/components/ui/toaster"
import { Suspense } from "react"
import Script from "next/script"

export const metadata: Metadata = {
    title: "BBSNS - Blockchain Based Secure Notarization System",
    description: "Secure Document Notarization with Blockchain Technology",
}

import { ConfigProvider } from "@/providers/ConfigProvider"
import { ConfigBarrier } from "@/components/ConfigBarrier"
import ResilienceBanner from "@/components/ResilienceBanner"

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="stylesheet" href="/globals.css" />
            </head>
            <body className="font-sans antialiased">
                <ResilienceBanner />
                <ConfigProvider>
                    <ConfigBarrier>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Authority...</div>}>
                            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                                <WalletProvider>
                                    {children}
                                    <Toaster />
                                </WalletProvider>
                            </ThemeProvider>
                        </Suspense>
                    </ConfigBarrier>
                </ConfigProvider>
                <Analytics />
            </body>
        </html>
    )
}
