"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

export function NotaryApplicationDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    license: "",
    experience: "",
  })
  const { toast } = useToast()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Mock submission
    toast({
      title: "Application Submitted",
      description: "Your notary public application has been received. We'll contact you within 2-3 business days.",
    })
    setIsOpen(false)
    setFormData({
      name: "",
      email: "",
      phone: "",
      license: "",
      experience: "",
    })
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="sm:hidden bg-transparent">
          Notary Public
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Apply as Notary Public</DialogTitle>
          <DialogDescription>
            Join our network of certified notary publics. Fill out the application form below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="license">Notary License Number</Label>
            <Input
              id="license"
              value={formData.license}
              onChange={(e) => handleInputChange("license", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="experience">Experience & Qualifications</Label>
            <Textarea
              id="experience"
              value={formData.experience}
              onChange={(e) => handleInputChange("experience", e.target.value)}
              placeholder="Describe your notary experience and qualifications..."
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Submit Application
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
