import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Suspense } from "react"
import { PageTransition } from "@/components/page-transition"
import "./globals.css"

export const metadata: Metadata = {
  title: "BBSNS - Blockchain Based Secure Notarization System",
  description: "Secure Document Notarization with Blockchain Technology",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <PageTransition>{children}</PageTransition>
          </ThemeProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
