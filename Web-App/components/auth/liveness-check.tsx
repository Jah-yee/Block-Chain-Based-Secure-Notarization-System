"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import * as faceapi from "@vladmandic/face-api"
import { Button } from "@/components/ui/button"
import { Camera, RefreshCw, CheckCircle2, AlertCircle, ShieldCheck, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface LivenessCheckProps {
  onComplete: (descriptor: number[]) => void
}

export function LivenessCheck({ onComplete }: LivenessCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "verifying" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const startCamera = async () => {
    try {
      setStatus("loading")
      setError(null)

      // Load Models
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models")
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models")
      await faceapi.nets.faceRecognitionNet.loadFromUri("/models")

      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setStatus("verifying")
        startVerification()
      } else {
        stream.getTracks().forEach(t => t.stop())
      }
    } catch (err: any) {
      console.error("Camera/Model Error:", err)
      setError(err.message || "Access to camera denied or failed.")
      setStatus("error")
    }
  }

  const startVerification = async () => {
    let count = 0
    const interval = setInterval(async () => {
      if (!videoRef.current || !videoRef.current.srcObject) {
        clearInterval(interval)
        return
      }

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (detection) {
          count += 10
          setProgress(count)

          if (count >= 100) {
            clearInterval(interval)
            setStatus("success")
            onComplete(Array.from(detection.descriptor))

            if (videoRef.current && videoRef.current.srcObject) {
              const stream = videoRef.current.srcObject as MediaStream
              stream.getTracks().forEach(t => t.stop())
            }
          }
        } else {
          count = Math.max(0, count - 5)
          setProgress(count)
        }
      } catch (e) {
        // Suppress errors during unmount/detection
      }
    }, 300)

    return () => clearInterval(interval)
  }

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[250px] relative">
      <AnimatePresence mode="wait">
        {status === "idle" && (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Camera size={32} />
            </div>
            <Button 
                onClick={startCamera} 
                className="h-12 px-8 font-bold uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-xl"
            >
              Enable Sensor
            </Button>
          </motion.div>
        )}

        {(status === "loading" || status === "verifying") && (
          <motion.div 
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full absolute inset-0 rounded-[2.5rem] overflow-hidden"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cn(
                "w-full h-full object-cover transition-all duration-1000",
                status === "loading" ? "blur-xl" : "grayscale opacity-80"
              )}
            />
            
            {status === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm z-20">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/60">Initializing...</span>
                </div>
            )}

            {status === "verifying" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                {/* Scanner Frame */}
                <div className="relative w-48 h-48">
                    <div className="absolute inset-0 border-2 border-primary/40 rounded-full animate-ping" />
                    <div className="absolute inset-0 border border-primary/20 rounded-full" />
                    <div className="absolute inset-[-4px] border-t-2 border-primary rounded-full animate-[spin_3s_linear_infinite]" />
                </div>

                <div className="mt-8 bg-slate-950/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/5 flex flex-col items-center shadow-2xl">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-3">Analyzing Neural Matrix</span>
                  <div className="w-40 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {status === "success" && (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-20 h-20 rounded-[2rem] bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
              <ShieldCheck size={48} className="animate-in zoom-in-50 duration-500" />
            </div>
            <div className="text-center">
                <h3 className="text-lg font-bold text-white uppercase tracking-wider">Identity Match</h3>
                <p className="text-xs text-emerald-400 font-medium tracking-tight">Biometric Signature Secured</p>
            </div>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div 
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 p-6 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                <AlertCircle size={32} />
            </div>
            <div className="space-y-1">
                <p className="text-sm font-bold text-white uppercase tracking-tighter">Connection Failed</p>
                <p className="text-xs text-slate-500">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={startCamera} className="border-white/10 hover:bg-white/5 rounded-xl h-10 px-6">
              <RefreshCw size={14} className="mr-2" /> Re-link Sensor
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
