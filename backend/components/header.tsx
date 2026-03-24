"use client"

import Link from "next/link"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"

export function Header() {
  const [isNotaryDialogOpen, setIsNotaryDialogOpen] = useState(false)

  const { scrollY } = useScroll()
  const headerShadow = useTransform(scrollY, [0, 100], ["0 0 0 rgba(0,0,0,0)", "0 4px 20px rgba(0,0,0,0.1)"])

  return (
    <motion.header
      className="sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/95"
      style={{
        boxShadow: headerShadow,
      }}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="container flex h-16 items-center justify-between">
        <motion.div className="flex items-center space-x-2" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <motion.div
            whileHover={{
              rotateY: 180,
              scale: 1.1,
            }}
            transition={{ duration: 0.6 }}
          >
            <Shield className="h-8 w-8 text-primary" />
          </motion.div>
          <span className="text-2xl font-bold text-foreground">BBSNS</span>
        </motion.div>

        <nav className="hidden md:flex items-center space-x-6">
          {[
            { href: "/", label: "Home" },
            { href: "#features", label: "Features" },
            { href: "#about", label: "About" },
            { href: "#contact", label: "Contact" },
          ].map((item, index) => (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -2 }}
            >
              <Link
                href={item.href}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors relative group"
              >
                {item.label}
                <motion.div
                  className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary"
                  whileHover={{ width: "100%" }}
                  transition={{ duration: 0.3 }}
                />
              </Link>
            </motion.div>
          ))}
        </nav>

        <motion.div
          className="flex items-center space-x-4"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <ThemeToggle />
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="outline" onClick={() => setIsNotaryDialogOpen(true)} className="hidden sm:inline-flex">
              Notary Public
            </Button>
          </motion.div>
          <div className="flex items-center space-x-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button variant="outline" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{
                scale: 1.05,
                boxShadow: "0 5px 15px rgba(25, 118, 210, 0.3)",
              }}
              whileTap={{ scale: 0.95 }}
            >
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.header>
  )
}
