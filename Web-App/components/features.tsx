"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, History, CheckCircle, Coins } from "lucide-react"
import { motion, useInView, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"

export function Features() {
  const containerRef = useRef(null)
  const titleRef = useRef(null)
  const isInView = useInView(titleRef, { once: true, margin: "-100px" })

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, -30])

  const features = [
    {
      icon: Upload,
      title: "Document Upload",
      description: "Securely upload your documents with drag-and-drop functionality. Supports PDF and JPEG formats.",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: History,
      title: "Version Control",
      description: "Track document versions and maintain a complete history of all changes and updates.",
      color: "text-teal-600",
      bgColor: "bg-teal-600/10",
    },
    {
      icon: CheckCircle,
      title: "Instant Verification",
      description: "Verify document authenticity instantly using blockchain hash verification.",
      color: "text-indigo-600",
      bgColor: "bg-indigo-600/10",
    },
    {
      icon: Coins,
      title: "Token System",
      description: "Use NTKR tokens for notarization services with transparent pricing and secure transactions.",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ]

  return (
    <motion.section
      id="features"
      ref={containerRef}
      className="py-20 px-4 relative overflow-hidden bg-gradient-to-b from-background to-card/20"
      style={{ y }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 30,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute top-20 right-10 w-32 h-32 bg-primary/8 rounded-full blur-2xl glow-effect"
        />
        <motion.div
          animate={{
            x: [0, -80, 0],
            y: [0, 60, 0],
            rotate: [360, 180, 0],
          }}
          transition={{
            duration: 25,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute bottom-20 left-10 w-40 h-40 bg-secondary/6 rounded-full blur-2xl"
        />
        <motion.div
          animate={{
            x: [0, 60, 0],
            y: [0, -40, 0],
            rotate: [0, -180, -360],
          }}
          transition={{
            duration: 35,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          className="absolute top-1/2 left-1/4 w-24 h-24 bg-accent/5 rounded-full blur-xl"
        />
      </div>

      <div className="container mx-auto relative z-10">
        <motion.div
          ref={titleRef}
          className="text-center mb-16"
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8 }}
        >
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            {isInView && (
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="inline-block overflow-hidden whitespace-nowrap"
              >
                Powerful Features
              </motion.span>
            )}
          </motion.h2>
          <motion.p
            className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            Everything you need for secure document notarization in one comprehensive platform
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{
                opacity: 0,
                y: 60,
                rotateX: -15,
                scale: 0.9,
              }}
              animate={
                isInView
                  ? {
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                    scale: 1,
                  }
                  : {
                    opacity: 0,
                    y: 60,
                    rotateX: -15,
                    scale: 0.9,
                  }
              }
              transition={{
                duration: 0.8,
                delay: 0.9 + index * 0.2,
                ease: "easeOut",
              }}
              whileHover={{
                scale: 1.05,
                rotateY: 8,
                rotateX: 8,
                boxShadow: "0 25px 50px rgba(22, 78, 99, 0.2)",
                transition: { duration: 0.3 },
              }}
              style={{ transformStyle: "preserve-3d" }}
              className="tilt-hover"
            >
              <Card className="text-center h-full bg-card/70 backdrop-blur-md border border-border/50 hover:border-primary/40 transition-all duration-500 shadow-xl hover:shadow-2xl group">
                <CardHeader className="pb-4">
                  <motion.div
                    className={`mx-auto mb-6 p-4 rounded-2xl ${feature.bgColor} backdrop-blur-sm float-animation`}
                    whileHover={{
                      rotateZ: 360,
                      scale: 1.2,
                      y: -8,
                    }}
                    animate={{
                      y: [0, -8, 0],
                    }}
                    transition={{
                      rotateZ: { duration: 0.8 },
                      scale: { duration: 0.3 },
                      y: {
                        duration: 3,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeInOut",
                        delay: index * 0.5,
                      },
                    }}
                  >
                    <feature.icon
                      className={`h-12 w-12 ${feature.color} drop-shadow-lg group-hover:drop-shadow-xl transition-all duration-300`}
                    />
                  </motion.div>
                  <CardTitle className="text-xl font-semibold text-card-foreground group-hover:text-primary transition-colors duration-300">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className={`absolute w-3 h-3 rounded-full ${i % 3 === 0 ? "bg-primary/20" : i % 3 === 1 ? "bg-secondary/20" : "bg-accent/20"
                }`}
              style={{
                left: `${15 + i * 12}%`,
                top: `${25 + (i % 3) * 25}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.8, 0.2],
                scale: [1, 1.8, 1],
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 5 + i * 0.5,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
                delay: i * 0.6,
              }}
            />
          ))}
        </div>
      </div>
    </motion.section>
  )
}
