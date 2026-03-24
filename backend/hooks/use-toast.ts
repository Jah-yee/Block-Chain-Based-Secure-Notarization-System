"use client"

// Keeping this simple for the demo - in production you'd want a more robust toast system
import { useState, useCallback } from "react"

interface Toast {
  title: string
  description?: string
  variant?: "default" | "destructive"
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((toast: Toast) => {
    // Simple alert for demo purposes - replace with proper toast UI
    const message = toast.description ? `${toast.title}: ${toast.description}` : toast.title
    alert(message)

    // In production, you'd add to toasts array and show proper toast UI
    setToasts((prev) => [...prev, toast])

    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 3000)
  }, [])

  return { toast, toasts }
}
