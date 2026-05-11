"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Loader2, Camera, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react"

type LivenessTask = "smile" | "turnLeft" | "turnRight"
const TASKS: LivenessTask[] = ["smile", "turnLeft", "turnRight"]

interface FaceLivenessScanProps {
    onPassed: (descriptor: number[]) => void
}

const SHUFFLE_TASKS = () => {
    // Select only 2 random tasks from the list
    const shuffled = [...TASKS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 2)
}

export function FaceLivenessScan({ onPassed }: FaceLivenessScanProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const faceapiRef = useRef<any>(null)
    const [isModelLoaded, setIsModelLoaded] = useState(false)
    const [isCameraActive, setIsCameraActive] = useState(false)
    const [status, setStatus] = useState<string>("Initializing secure scanner...")
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [isVerifying, setIsVerifying] = useState(false)
    const [sessionExpired, setSessionExpired] = useState(false)
    const [activeTasks, setActiveTasks] = useState<LivenessTask[]>([])

    // Refs for animation loop state to avoid stale closures
    const taskIndexRef = useRef(0)
    const tasksRef = useRef<LivenessTask[]>([])
    const isCameraActiveRef = useRef(false)
    const sessionExpiredRef = useRef(false)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const wasClosedRef = useRef(false)
    const framesRef = useRef(0)
    const abortControllerRef = useRef<AbortController | null>(null)
    const isInitializingRef = useRef(false)
    const streamRef = useRef<MediaStream | null>(null)

    // Load models on mount
    useEffect(() => {
        let isMounted = true

        const loadModels = async () => {
            try {
                const faceapi = await import("@vladmandic/face-api")

                if (!isMounted) return

                faceapiRef.current = faceapi

                const MODEL_URL = "/models"
                await Promise.all([
                    faceapiRef.current.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapiRef.current.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapiRef.current.nets.faceExpressionNet.loadFromUri(MODEL_URL),
                    faceapiRef.current.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                ])

                if (isMounted) {
                    setIsModelLoaded(true)
                    setStatus("Ready. Align your face and press Start Scanner")
                    console.log("[LIVENESS] Models loaded successfully")
                }
            } catch (err) {
                if (isMounted) {
                    console.error("Failed to load FaceAPI models:", err)
                    setError("Failed to initialize biometric scan. Please check your connection.")
                }
            }
        }
        loadModels()
        return () => {
            isMounted = false
            stopCamera()
        }
    }, [])

    const startCamera = async () => {
        // Prevent multiple simultaneous camera initialization attempts
        if (isInitializingRef.current) {
            console.log("[LIVENESS] Camera initialization already in progress, skipping...")
            return
        }

        isInitializingRef.current = true
        setError(null)
        setSessionExpired(false)
        sessionExpiredRef.current = false
        taskIndexRef.current = 0
        setCurrentTaskIndex(0)
        setProgress(0)
        wasClosedRef.current = false
        framesRef.current = 0

        // Create new abort controller for this session
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        // Shuffle tasks for this session (anti-replay)
        const shuffled = SHUFFLE_TASKS()
        tasksRef.current = shuffled
        setActiveTasks(shuffled)
        console.log(`[LIVENESS] New session - ${shuffled.length} random tasks selected:`, shuffled)

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
            })

            // Check if aborted during getUserMedia call
            if (abortControllerRef.current?.signal.aborted) {
                console.log("[LIVENESS] Camera init aborted")
                stream.getTracks().forEach(track => track.stop())
                isInitializingRef.current = false
                return
            }

            if (videoRef.current) {
                videoRef.current.srcObject = stream
                streamRef.current = stream // Direct tracking for cleanup
                setIsCameraActive(true)
                isCameraActiveRef.current = true
                setStatus("Waking up camera...")

                const video = videoRef.current

                // Set up play event handler
                const handlePlay = () => {
                    if (!isCameraActiveRef.current) return; // Clean up was called before play started
                    console.log("[LIVENESS] Video started playing")
                    setStatus("Hold steady... Detecting face...")
                    isInitializingRef.current = false
                    startLivenessLoop()
                    startSessionTimer()
                }

                video.onplay = handlePlay

                // Explicitly call play with timeout
                try {
                    const playPromise = video.play()

                    // Add timeout for play operation
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error("Play timeout")), 5000)
                    })

                    await Promise.race([playPromise, timeoutPromise])
                } catch (e: any) {
                    if (e.message === "Play timeout") {
                        console.warn("[LIVENESS] Play timed out, but video may still start")
                        // Don't treat this as a fatal error, video.onplay will handle it
                    } else if (e.name === "AbortError") {
                        console.warn("[LIVENESS] Play aborted, but this is normal during initialization")
                    } else {
                        console.warn("[LIVENESS] Play failed:", e)
                    }
                    isInitializingRef.current = false
                }
            }
        } catch (err: any) {
            console.error("Camera error:", err)
            isInitializingRef.current = false

            if (err.name === "NotAllowedError") {
                setError("Camera permission denied. Please allow camera access and try again.")
            } else if (err.name === "NotFoundError") {
                setError("No camera found. Please connect a camera and try again.")
            } else if (err.name === "NotReadableError") {
                setError("Camera is being used by another application. Please close other apps and try again.")
            } else {
                setError("Camera access failed. Please try again.")
            }
        }
    }

    const stopCamera = useCallback(() => {
        console.log("[LIVENESS] Stopping camera...")

        if (timerRef.current) clearTimeout(timerRef.current)

        // Abort any pending camera initialization
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }

        isCameraActiveRef.current = false
        isInitializingRef.current = false
        setIsCameraActive(false)
        setStatus("Scanner stopped.")

        if (videoRef.current) {
            // Remove event handlers
            videoRef.current.onplay = null;
            videoRef.current.pause();
            videoRef.current.srcObject = null;
        }

        // Final fail-safe: Stop tracks from the stream ref directly
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                try {
                    track.stop();
                    track.enabled = false;
                    console.log("[LIVENESS] Forced STOP on track (ref):", track.kind);
                } catch (e) {
                    console.warn("[LIVENESS] Error stopping track in cleanup:", e);
                }
            })
            streamRef.current = null
        }

        // Clear canvas
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d")
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
    }, [])

    const startSessionTimer = () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            if (isCameraActiveRef.current) {
                console.log("[LIVENESS] Session timeout (20s) reached.")
                stopCamera()
                setSessionExpired(true)
                sessionExpiredRef.current = true
                setError("Verification timed out (20s). Please try again in a well-lit area.")
            }
        }, 20000) // 🛡️ [Hardening 2.9C-A] Reduced from 60s to 20s
    }

    const startLivenessLoop = async () => {
        if (!videoRef.current || !isModelLoaded || !faceapiRef.current) return

        const loop = async () => {
            if (!isCameraActiveRef.current || sessionExpiredRef.current || !videoRef.current || !faceapiRef.current) return

            const faceapi = faceapiRef.current
            const video = videoRef.current
            const canvas = canvasRef.current

            // Ensure video has dimensions before running FaceAPI
            if (video.paused || video.ended || video.readyState < 2) {
                requestAnimationFrame(loop)
                return
            }

            try {
                const detections = await faceapi
                    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 }))
                    .withFaceLandmarks()
                    .withFaceExpressions()

                if (detections && canvas) {
                    const dims = faceapi.matchDimensions(canvas, video, true)
                    const resizedDetections = faceapi.resizeResults(detections, dims)

                    const ctx = canvas.getContext("2d")
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height)
                        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
                        // Also draw detection box for debug/UX
                        const box = resizedDetections.detection.box
                        ctx.strokeStyle = '#00ff00'
                        ctx.lineWidth = 2
                        ctx.strokeRect(box.x, box.y, box.width, box.height)
                    }

                    const landmarks = detections.landmarks
                    const expressions = detections.expressions
                    const task = tasksRef.current[taskIndexRef.current]

                    // Distance Check (Face should occupy at least 8-45% of the frame)
                    const faceBox = resizedDetections.detection.box
                    const faceArea = faceBox.width * faceBox.height
                    const canvasArea = canvas.width * canvas.height
                    const faceRatio = faceArea / canvasArea

                    if (faceRatio < 0.10) {
                        setStatus("Move closer to the camera")
                    } else if (faceRatio > 0.40) {
                        setStatus("Move slightly back")
                    } else {
                        // Face is in good position, check tasks
                        let taskMet = false

                        if (task === "smile") {
                            if (expressions.happy > 0.7) taskMet = true
                        } else if (task === "turnLeft" || task === "turnRight") {
                            const nose = landmarks.getNose()[0]
                            const jaw = landmarks.getJawOutline()
                            const leftJaw = jaw[0]
                            const rightJaw = jaw[16]
                            const ratio = (nose.x - leftJaw.x) / (rightJaw.x - leftJaw.x)

                            if (task === "turnLeft" && ratio < 0.38) taskMet = true
                            if (task === "turnRight" && ratio > 0.62) taskMet = true
                        }

                        if (taskMet) {
                            if (taskIndexRef.current < tasksRef.current.length - 1) {
                                taskIndexRef.current += 1
                                setCurrentTaskIndex(taskIndexRef.current)
                                setProgress((taskIndexRef.current / tasksRef.current.length) * 100)
                                setStatus(`Great! Next: ${getTaskInstruction(tasksRef.current[taskIndexRef.current])}`)
                                wasClosedRef.current = false
                                framesRef.current = 0
                                await new Promise(r => setTimeout(r, 800));
                            } else {
                                setStatus("Tasks finished! Extracting fingerprint...")
                                setProgress(100)
                                setIsVerifying(true)

                                // Stop the animation loop temporarily during extraction
                                isCameraActiveRef.current = false
                                await new Promise(r => setTimeout(r, 500));

                                try {
                                    const finalDetection = await faceapi
                                        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                                        .withFaceLandmarks()
                                        .withFaceDescriptor()

                                    if (finalDetection?.descriptor) {
                                        console.log("[LIVENESS] Fingerprint extraction successful")
                                        stopCamera()
                                        onPassed(Array.from(finalDetection.descriptor))
                                        return
                                    } else {
                                        console.warn("[LIVENESS] Extraction failed - face not detected, retrying...")
                                        setIsVerifying(false)
                                        setStatus("Hold still... detecting face for verification")
                                        setProgress(95)
                                        // Reset to allow retry
                                        taskIndexRef.current = tasksRef.current.length - 1
                                        isCameraActiveRef.current = true
                                    }
                                } catch (err) {
                                    console.error("[LIVENESS] Extraction error:", err)
                                    setIsVerifying(false)
                                    setError("Descriptor extraction failed. Please ensure your face is fully visible.")
                                    stopCamera() // 🛡️ [Step 5] Stop camera on failure
                                }
                            }
                        } else {
                            setStatus(`[${taskIndexRef.current + 1}/${tasksRef.current.length}] ${getTaskInstruction(tasksRef.current[taskIndexRef.current])}`)
                        }
                    }
                } else {
                    setStatus("Searching for face... Stay centered.")
                    // Clear canvas if no face
                    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
                }
            } catch (err) {
                console.error("Inference error:", err)
            }

            if (isCameraActiveRef.current && !sessionExpiredRef.current) {
                requestAnimationFrame(loop)
            }
        }

        loop()
    }


    const getTaskInstruction = (task: LivenessTask) => {
        switch (task) {
            case "smile": return "Please smile for the camera"
            case "turnLeft": return "Turn your head slightly RIGHT"
            case "turnRight": return "Turn your head slightly LEFT"
            default: return "Verification in progress..."
        }
    }

    const handleRetry = () => {
        console.log("[LIVENESS] Retry requested")
        stopCamera()
        // Increased delay to ensure complete cleanup before restart
        setTimeout(() => {
            startCamera()
        }, 800)
    }

    return (
        <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm border-primary/20">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Secure Face Scan
                </h3>
                {isCameraActive && (
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-3 w-3 animate-spin text-primary opacity-50" />
                        <span className="text-xs font-medium text-red-500 animate-pulse flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            LIVE SCANNER
                        </span>
                    </div>
                )}
            </div>

            <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border shadow-inner">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`h-full w-full object-cover transition-opacity duration-500 ${isCameraActive ? "opacity-100" : "opacity-0"}`}
                />
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />

                {!isCameraActive && !error && !isVerifying && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        {isModelLoaded ? (
                            <>
                                <Camera className="h-12 w-12 text-muted-foreground/40 mb-3" />
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    Ready for verification. Ensure you are in a well-lit environment.
                                </p>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Downloading secure models (~5MB)...</p>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-start bg-background/95 p-4 text-center backdrop-blur-sm overflow-y-auto z-20">
                        <div className="flex flex-col items-center py-6 w-full max-w-sm">
                            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                                <AlertCircle className="h-6 w-6 text-destructive" />
                            </div>
                            <h4 className="text-sm font-bold text-destructive mb-1">Scanner Interrupted</h4>
                            <p className="text-xs text-muted-foreground px-4 mb-4 leading-relaxed">{error}</p>
                        </div>

                        {error.includes("Camera permission denied") && (
                            <div className="mt-2 w-full max-w-sm">
                                <details className="group rounded-lg border border-border bg-muted/40 overflow-hidden">
                                    <summary className="px-4 py-2 text-[11px] font-semibold cursor-pointer list-none flex items-center justify-between hover:bg-muted/30 transition-colors">
                                        <span className="flex items-center gap-2">
                                            <Camera className="h-3 w-3" /> How to enable camera
                                        </span>
                                        <RefreshCw className="h-3 w-3 transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="px-4 pb-3 space-y-2 border-t border-border/20 pt-2 text-left">
                                        <ol className="text-[10px] space-y-1 text-muted-foreground list-decimal list-inside leading-normal">
                                            <li>Look for camera icon 🎥 in address bar</li>
                                            <li>Select "Allow" or "Always allow"</li>
                                            <li>Or click lock 🔒 icon → Site settings → Camera</li>
                                        </ol>
                                        <p className="text-[9px] text-muted-foreground italic mt-2 opacity-70">
                                            💡 Form data is saved; refresh after allowing.
                                        </p>
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>
                )}

                {isVerifying && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6 text-center z-50">
                        <ShieldCheck className="h-12 w-12 text-green-500 mb-3" />
                        <p className="text-lg font-bold text-foreground">Verified Successfully</p>
                        <p className="text-xs text-muted-foreground mt-1">Generating secure descriptor...</p>
                    </div>
                )}

                {isCameraActive && !isVerifying && (
                    <div className="absolute top-4 left-4 right-4 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-md">
                        <Progress value={progress} className="h-full bg-primary transition-all duration-300" />
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {(!error && !isVerifying) && (
                    <div className={`p-3 rounded-lg border transition-all ${isCameraActive ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent"}`}>
                        <p className="text-sm font-medium text-center">
                            {status}
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {!isCameraActive && !isVerifying && (
                        <Button
                            type="button"
                            onClick={handleRetry}
                            disabled={!isModelLoaded}
                            className="w-full h-11 text-base font-bold shadow-lg shadow-primary/30 animate-in fade-in zoom-in duration-300"
                        >
                            <Camera className="h-5 w-5 mr-2" /> {error ? "Retry Scanner" : "Start Scanner"}
                        </Button>
                    )}

                    {isCameraActive && (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRetry}
                                className="flex-1 text-xs"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" /> Reset Scan
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={stopCamera}
                                className="flex-1 text-xs text-muted-foreground hover:text-destructive"
                            >
                                Cancel
                            </Button>
                        </div>
                    )}

                    <p className="text-[10px] text-center text-muted-foreground px-4 leading-relaxed">
                        🛡️ Privacy Policy: This scan runs **fully on your device** via WebAssembly.
                        No video or raw images ever leave your browser. Only an encrypted mathematical
                        descriptor is stored for your security.
                    </p>
                </div>
            </div>
        </div >
    )
}
