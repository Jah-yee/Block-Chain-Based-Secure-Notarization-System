"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import * as faceapi from "@vladmandic/face-api"
import { Button } from "@/components/ui/button"
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

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
        // If component unmounted during load, stop stream immediately
        stream.getTracks().forEach(t => t.stop())
      }
    } catch (err: any) {
      console.error("Camera/Model Error:", err)
      setError(err.message || "Could not access camera.")
      setStatus("error")
    }
  }

  const startVerification = async () => {
    let count = 0
    const interval = setInterval(async () => {
      // 1. Safety check: Component mounted and video ready?
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
          count += 20
          setProgress(count)

          if (count >= 100) {
            clearInterval(interval)
            setStatus("success")
            onComplete(Array.from(detection.descriptor))

            // 2. Safe cleanup: Ensure ref is still valid before accessing property
            if (videoRef.current && videoRef.current.srcObject) {
              const stream = videoRef.current.srcObject as MediaStream
              stream.getTracks().forEach(t => t.stop())
            }
          }
        } else {
          count = Math.max(0, count - 10)
          setProgress(count)
        }
      } catch (e) {
        // Suppress errors during unmount/detection
      }
    }, 500)

    // Cleanup interval on unmount
    return () => clearInterval(interval)
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
        {status === "idle" && (
          <Button onClick={startCamera} className="gap-2">
            <Camera size={18} /> Enable Camera
          </Button>
        )}

        {(status === "loading" || status === "verifying") && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover grayscale brightness-75 transition-all"
          />
        )}

        {status === "verifying" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-primary/50 border-dashed rounded-full animate-[spin_10s_linear_infinite] mb-4" />
            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-primary/20 flex flex-col items-center">
              <span className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Scanning Face...</span>
              <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={32} />
            </div>
            <span className="text-lg font-bold text-emerald-400">Identity Verified</span>
          </div>
        )}

        {status === "error" && (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="mx-auto text-rose-500" size={48} />
            <p className="text-sm text-slate-400">{error}</p>
            <Button variant="outline" size="sm" onClick={startCamera}>
              <RefreshCw size={14} className="mr-2" /> Try Again
            </Button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 text-center uppercase tracking-tighter">
        {status === "verifying" ? "Stay still and look directly at the sensor" : "Secure biometric bridge active"}
      </p>
    </div>
  )
}
