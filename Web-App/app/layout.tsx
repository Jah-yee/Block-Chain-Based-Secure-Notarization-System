import type React from "react"
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { WalletProvider } from "@/hooks/use-wallet-session"
import { Toaster } from "@/components/ui/toaster"
import { Suspense } from "react"
import Script from "next/script"

export const metadata: Metadata = {
    title: "BBSNS | Secure Notarization",
    description: "Blockchain-Based Secure Notarization System - Administrative Authority",
    icons: {
        icon: "/icon.svg",
        shortcut: "/icon.svg",
        apple: "/icon.svg",
    }
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
                <ConfigProvider>
                    <ConfigBarrier>
                        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Authority...</div>}>
                            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                                <WalletProvider>
                                    <ResilienceBanner />
                                    {children}
                                    <Toaster />
                                </WalletProvider>
                            </ThemeProvider>
                        </Suspense>
                    </ConfigBarrier>
                </ConfigProvider>
            </body>
        </html>
    )
}
