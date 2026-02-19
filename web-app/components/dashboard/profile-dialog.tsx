"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useWalletSession } from "@/hooks/use-wallet-session"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface ProfileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
    const { user, connectedAccount } = useWalletSession()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Profile</DialogTitle>
                    <DialogDescription>
                        Manage your personal information and account details.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <Card className="border-none shadow-none bg-secondary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">User Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border-2 border-background">
                                    <AvatarFallback className="text-lg bg-primary/10 text-primary">
                                        {user?.name?.slice(0, 2).toUpperCase() || "JD"}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-semibold">{user?.name || "Guest User"}</h3>
                                    <p className="text-sm text-muted-foreground">{user?.email || "No email connected"}</p>
                                </div>
                            </div>

                            <div className="grid gap-2 text-sm">
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="font-medium">Username</span>
                                    <span className="text-muted-foreground">{user?.username || "Not set"}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="font-medium">Role</span>
                                    <Badge variant="outline" className="capitalize">{user?.role || "User"}</Badge>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span className="font-medium">KYC Status</span>
                                    <Badge variant={user?.kyc_verified ? "default" : "secondary"}>
                                        {user?.kyc_verified ? "Verified" : (user?.liveness_status || "Unverified")}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-none bg-secondary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Wallet Connection</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                                <h4 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wider">Registered Wallet</h4>
                                <code className="text-[10px] md:text-xs font-mono break-all text-foreground">
                                    {user?.wallet_address || "No wallet linked to profile"}
                                </code>
                            </div>

                            <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                                <h4 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wider">Active Session</h4>
                                <code className="text-[10px] md:text-xs font-mono break-all text-foreground">
                                    {connectedAccount || "Wallet not connected"}
                                </code>
                                {connectedAccount && user?.wallet_address && connectedAccount.toLowerCase() !== user.wallet_address.toLowerCase() && (
                                    <p className="text-xs text-destructive mt-2 font-medium flex items-center gap-1">
                                        ⚠️ Mismatch detected. Please switch accounts.
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    )
}
