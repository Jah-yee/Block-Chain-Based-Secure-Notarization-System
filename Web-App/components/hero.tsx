"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Shield, Lock, FileCheck } from "lucide-react"
import { motion, useScroll, useTransform, useInView } from "framer-motion"
import { useRef } from "react"

export function Hero() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, -50])
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0.3])

  const titleRef = useRef(null)
  const isInView = useInView(titleRef, { once: true, margin: "-100px" })

  return (
    <motion.section
      ref={containerRef}
      style={{ y, opacity }}
      className="py-20 px-4 text-center bg-gradient-to-br from-background via-card/30 to-muted/40 relative overflow-hidden"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            rotate: [0, 360],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl glow-effect"
        />
        <motion.div
          animate={{
            rotate: [360, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/8 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            rotate: [0, -360],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 30,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/5 rounded-full blur-2xl"
        />
      </div>

      <div className="container mx-auto max-w-4xl relative z-10">
        <motion.div
          className="flex justify-center mb-8"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.div
            className="flex items-center space-x-4 p-6 rounded-2xl bg-card/80 backdrop-blur-md border border-border/50 shadow-2xl float-animation"
            whileHover={{
              scale: 1.05,
              rotateY: 8,
              rotateX: 8,
              boxShadow: "0 25px 50px rgba(22, 78, 99, 0.25)",
            }}
            style={{
              transformStyle: "preserve-3d",
            }}
          >
            <motion.div
              animate={{
                rotateY: [0, 360],
                y: [0, -10, 0],
              }}
              transition={{
                rotateY: { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" },
                y: { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
              }}
            >
              <Shield className="h-12 w-12 text-primary drop-shadow-lg" />
            </motion.div>
            <motion.div
              animate={{
                rotateY: [0, 360],
                y: [0, -10, 0],
              }}
              transition={{
                rotateY: { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear", delay: 0.5 },
                y: { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 0.3 },
              }}
            >
              <Lock className="h-12 w-12 text-teal-600 drop-shadow-lg" />
            </motion.div>
            <motion.div
              animate={{
                rotateY: [0, 360],
                y: [0, -10, 0],
              }}
              transition={{
                rotateY: { duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear", delay: 1 },
                y: { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 0.6 },
              }}
            >
              <FileCheck className="h-12 w-12 text-indigo-600 drop-shadow-lg" />
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.h1
          ref={titleRef}
          className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight text-center"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          {isInView && (
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="inline-block overflow-hidden break-words"
            >
              Secure Document Notarization with Blockchain
            </motion.span>
          )}
        </motion.h1>


        <motion.p
          className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty leading-relaxed"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          Experience the future of document authentication with our blockchain-based notarization system. Secure,
          transparent, and legally binding document verification at your fingertips.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.9 }}
        >
          <motion.div
            whileHover={{
              scale: 1.05,
              boxShadow: "0 15px 35px rgba(22, 78, 99, 0.4)",
              rotateX: 5,
            }}
            whileTap={{ scale: 0.95 }}
            className="tilt-hover"
          >
            <Button size="lg" asChild className="w-full sm:w-auto shadow-lg">
              <Link href="/signup">Get Started</Link>
            </Button>
          </motion.div>
          <motion.div
            whileHover={{
              scale: 1.05,
              backgroundColor: "rgba(22, 78, 99, 0.1)",
              boxShadow: "0 10px 25px rgba(99, 102, 241, 0.2)",
              rotateX: 5,
            }}
            whileTap={{ scale: 0.95 }}
            className="tilt-hover"
          >
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto bg-transparent border-2">
              <Link href="/register-notary">Register as Notary</Link>
            </Button>
          </motion.div>
          <motion.div
            whileHover={{
              scale: 1.05,
              backgroundColor: "rgba(22, 78, 99, 0.1)",
              boxShadow: "0 10px 25px rgba(99, 102, 241, 0.2)",
              rotateX: 5,
            }}
            whileTap={{ scale: 0.95 }}
            className="tilt-hover"
          >
            <Button size="lg" variant="ghost" asChild className="w-full sm:w-auto">
              <Link href="/login">Sign In</Link>
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
        >
          {[
            {
              icon: Shield,
              title: "Blockchain Security",
              desc: "Immutable records protected by advanced cryptography",
              color: "text-primary",
            },
            {
              icon: Lock,
              title: "Legal Compliance",
              desc: "Fully compliant with international notarization standards",
              color: "text-teal-600",
            },
            {
              icon: FileCheck,
              title: "Instant Verification",
              desc: "Real-time document authenticity verification",
              color: "text-indigo-600",
            },
          ].map((item, index) => (
            <motion.div
              key={index}
              className="group p-8 rounded-2xl bg-card/60 backdrop-blur-md border border-border/50 shadow-xl hover:shadow-2xl transition-all duration-300"
              initial={{ opacity: 0, y: 50, rotateX: -15 }}
              animate={
                isInView
                  ? {
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                  }
                  : {
                    opacity: 0,
                    y: 50,
                    rotateX: -15,
                  }
              }
              transition={{
                duration: 0.8,
                delay: 1.4 + index * 0.2,
                ease: "easeOut",
              }}
              whileHover={{
                scale: 1.05,
                rotateY: 8,
                rotateX: 8,
                boxShadow: "0 25px 50px rgba(0,0,0,0.15)",
                transition: { duration: 0.3 },
              }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <motion.div
                whileHover={{
                  rotateZ: 360,
                  scale: 1.2,
                }}
                transition={{ duration: 0.6 }}
                className="float-animation"
              >
                <item.icon
                  className={`h-14 w-14 ${item.color} mx-auto mb-6 drop-shadow-lg group-hover:drop-shadow-xl transition-all duration-300`}
                />
              </motion.div>
              <h3 className="text-xl font-semibold text-card-foreground mb-3">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  )
}
