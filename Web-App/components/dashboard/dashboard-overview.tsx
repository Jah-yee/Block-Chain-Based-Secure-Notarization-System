"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, CheckCircle, Clock, AlertCircle } from "lucide-react"
import { motion, useInView } from "framer-motion"
import { useRef, useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"

export function DashboardOverview() {
  const containerRef = useRef(null)
  const isInView = useInView(containerRef, { once: true })
  const [animatedValues, setAnimatedValues] = useState([0, 0, 0, 0])
  const [documents, setDocuments] = useState<any[]>([])

  // Fetch real documents from API
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const data = await apiClient.get('/api/documents')
        setDocuments(data || [])
      } catch (err) {
        console.error("Failed to fetch documents for overview:", err)
        setDocuments([])
      }
    }
    fetchDocuments()
  }, [])

  const totalDocuments = documents.length
  const verifiedDocuments = documents.filter((doc) => doc.status === "verified" || doc.status === "approved").length
  const pendingDocuments = documents.filter((doc) => doc.status === "pending").length
  const rejectedDocuments = documents.filter((doc) => doc.status === "rejected").length

  const actualValues = [totalDocuments, verifiedDocuments, pendingDocuments, rejectedDocuments]

  useEffect(() => {
    if (isInView) {
      actualValues.forEach((value, index) => {
        let start = 0
        const increment = value / 30
        const timer = setInterval(() => {
          start += increment
          if (start >= value) {
            start = value
            clearInterval(timer)
          }
          setAnimatedValues((prev) => {
            const newValues = [...prev]
            newValues[index] = Math.floor(start)
            return newValues
          })
        }, 50)
      })
    }
  }, [isInView, totalDocuments, verifiedDocuments, pendingDocuments, rejectedDocuments])

  const stats = [
    {
      title: "Total Documents",
      value: animatedValues[0],
      description: "Documents uploaded",
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10",
      glowColor: "rgba(22, 78, 99, 0.3)",
    },
    {
      title: "Verified",
      value: animatedValues[1],
      description: "Successfully notarized",
      icon: CheckCircle,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
      glowColor: "rgba(99, 102, 241, 0.3)",
    },
    {
      title: "Pending",
      value: animatedValues[2],
      description: "Awaiting verification",
      icon: Clock,
      color: "text-accent",
      bgColor: "bg-accent/10",
      glowColor: "rgba(217, 119, 6, 0.3)",
    },
    {
      title: "Rejected",
      value: animatedValues[3],
      description: "Failed verification",
      icon: AlertCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      glowColor: "rgba(239, 68, 68, 0.3)",
    },
  ]

  return (
    <motion.div
      ref={containerRef}
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.title}
          initial={{
            opacity: 0,
            y: 30,
            scale: 0.9,
            rotateX: -10,
          }}
          animate={
            isInView
              ? {
                opacity: 1,
                y: 0,
                scale: 1,
                rotateX: 0,
              }
              : {
                opacity: 0,
                y: 30,
                scale: 0.9,
                rotateX: -10,
              }
          }
          transition={{
            duration: 0.6,
            delay: index * 0.1,
            ease: "easeOut",
          }}
          whileHover={{
            scale: 1.05,
            rotateY: 8,
            rotateX: 8,
            boxShadow: `0 20px 40px ${stat.glowColor}`,
            transition: { duration: 0.3 },
          }}
          style={{ transformStyle: "preserve-3d" }}
          className="tilt-hover"
        >
          <Card
            className={`relative overflow-hidden bg-card/70 backdrop-blur-md border border-border/50 hover:border-primary/40 transition-all duration-500 shadow-xl hover:shadow-2xl group float-animation`}
            style={{ animationDelay: `${index * 0.5}s` }}
          >
            <motion.div
              className={`absolute inset-0 bg-gradient-to-br from-transparent via-primary/5 to-primary/10 opacity-0 group-hover:opacity-100`}
              transition={{ duration: 0.3 }}
            />

            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors duration-300">
                {stat.title}
              </CardTitle>
              <motion.div
                className={`p-3 rounded-xl ${stat.bgColor} backdrop-blur-sm`}
                whileHover={{
                  scale: 1.3,
                  rotate: 360,
                }}
                animate={{
                  scale: [1, 1.1, 1],
                  y: [0, -5, 0],
                }}
                transition={{
                  scale: {
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: index * 0.5,
                  },
                  y: {
                    duration: 3,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: index * 0.3,
                  },
                  rotate: { duration: 0.6 },
                }}
              >
                <stat.icon className={`h-5 w-5 ${stat.color} drop-shadow-lg`} />
              </motion.div>
            </CardHeader>
            <CardContent className="relative z-10">
              <motion.div
                className="text-3xl font-bold text-card-foreground mb-1"
                initial={{ scale: 0 }}
                animate={isInView ? { scale: 1 } : { scale: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  delay: 0.3 + index * 0.1,
                }}
              >
                {stat.value}
              </motion.div>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed">
                {stat.description}
              </CardDescription>
            </CardContent>

            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={i}
                  className={`absolute w-2 h-2 ${stat.color.replace("text-", "bg-")} rounded-full opacity-20`}
                  style={{
                    left: `${15 + i * 25}%`,
                    top: `${20 + (i % 2) * 40}%`,
                  }}
                  animate={{
                    y: [0, -15, 0],
                    opacity: [0.2, 0.6, 0.2],
                    scale: [1, 1.5, 1],
                  }}
                  transition={{
                    duration: 4 + i * 0.5,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: index * 0.2 + i * 0.3,
                  }}
                />
              ))}
            </div>

            <motion.div
              className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100"
              style={{
                background: `radial-gradient(circle at center, ${stat.glowColor} 0%, transparent 70%)`,
              }}
              transition={{ duration: 0.3 }}
            />
          </Card>
        </motion.div>
      ))}
    </motion.div>
  )
}
