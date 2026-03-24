import Link from "next/link"
import { Shield, Mail, Phone, MapPin } from "lucide-react"

export function Footer() {
  return (
    <footer id="contact" className="bg-muted/30 border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-foreground">BBSNS</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Blockchain Based Secure Notarization System - The future of document authentication.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Quick Links</h3>
            <div className="space-y-2">
              <Link href="/" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Home
              </Link>
              <Link
                href="#features"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Features
              </Link>
              <Link href="#about" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                About
              </Link>
              <Link href="/signup" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Get Started
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Contact Info</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>support@bbsns.com</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>123 Blockchain Ave, Tech City, TC 12345</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Legal</h3>
            <div className="space-y-2">
              <Link
                href="/privacy"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
              <Link href="/terms" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms of Service
              </Link>
              <Link
                href="/compliance"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Compliance
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 BBSNS. All rights reserved. Blockchain Based Secure Notarization System.
          </p>
        </div>
      </div>
    </footer>
  )
}
