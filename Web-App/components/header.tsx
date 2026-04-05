"use client"

import Link from "next/link"
import { Shield, User, LogOut, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { useWalletSession } from "@/hooks/use-wallet-session"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function Header() {
  const { user, logout } = useWalletSession()
  const { scrollY } = useScroll()
  const headerShadow = useTransform(scrollY, [0, 100], ["0 0 0 rgba(0,0,0,0)", "0 4px 20px rgba(0,0,0,0.1)"])

  return (
    <motion.header
      className="sticky top-0 z-40 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/95"
      style={{
        boxShadow: headerShadow,
      }}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="container flex h-16 items-center justify-between">
        <motion.div className="flex items-center space-x-2" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link href="/" className="flex items-center space-x-2">
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
          </Link>
        </motion.div>

        <nav className="hidden md:flex items-center space-x-6">
          {[
            { href: "/", label: "Home" },
            { href: "/#features", label: "Features" },
            { href: "/register-notary", label: "Become a Notary" },
            { href: "/#about", label: "About" },
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

          {user ? (
            <div className="flex items-center space-x-3">
              <Button variant="outline" asChild className="hidden sm:flex gap-2">
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full border border-primary/20 p-0 overflow-hidden">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden lg:block">
                <Button variant="outline" asChild className="border-primary/50 text-primary hover:bg-primary/10">
                  <Link href="/register-notary">Register as Notary</Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden sm:block">
                <Button variant="ghost" asChild>
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
                  <Link href="/signup">Get Started</Link>
                </Button>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </motion.header>
  )
}
