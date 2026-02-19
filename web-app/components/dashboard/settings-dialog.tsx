"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTheme } from "next-themes"
import { Laptop, Moon, Sun, Bell, Monitor, Shield } from "lucide-react"

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { theme, setTheme } = useTheme()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Manage your preferences.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="appearance" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="appearance">Appearance</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    </TabsList>

                    <TabsContent value="appearance" className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-medium flex items-center gap-2">
                                    <Monitor className="h-4 w-4" /> Theme
                                </h3>
                                <span className="text-xs text-muted-foreground">Select your interface theme.</span>
                            </div>

                            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
                                <Button
                                    variant={theme === "light" ? "default" : "ghost"}
                                    size="icon"
                                    className="h-8 w-8 rounded-md"
                                    onClick={() => setTheme("light")}
                                    title="Light Mode"
                                >
                                    <Sun className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={theme === "dark" ? "default" : "ghost"}
                                    size="icon"
                                    className="h-8 w-8 rounded-md"
                                    onClick={() => setTheme("dark")}
                                    title="Dark Mode"
                                >
                                    <Moon className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={theme === "system" ? "default" : "ghost"}
                                    size="icon"
                                    className="h-8 w-8 rounded-md"
                                    onClick={() => setTheme("system")}
                                    title="System Theme"
                                >
                                    <Laptop className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between space-x-2 pt-2">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-medium flex items-center gap-2">
                                    <Shield className="h-4 w-4" /> Compact Mode
                                </h3>
                                <span className="text-xs text-muted-foreground">Reduce interface spacing.</span>
                            </div>
                            <Switch id="compact-mode" />
                        </div>
                    </TabsContent>

                    <TabsContent value="notifications" className="space-y-4">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                            <Bell className="h-4 w-4" /> Alert Preferences
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <div className="flex flex-col space-y-1">
                                    <Label htmlFor="email-notifs">Email Notifications</Label>
                                    <span className="text-xs text-muted-foreground">Receive updates about your document status.</span>
                                </div>
                                <Switch id="email-notifs" defaultChecked />
                            </div>
                            <div className="flex items-center justify-between space-x-2">
                                <div className="flex flex-col space-y-1">
                                    <Label htmlFor="marketing-emails">Marketing Emails</Label>
                                    <span className="text-xs text-muted-foreground">Receive news and special offers.</span>
                                </div>
                                <Switch id="marketing-emails" />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="flex justify-end pt-2">
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
