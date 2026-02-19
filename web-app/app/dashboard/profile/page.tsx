"use client"

import { useWalletSession } from "@/hooks/use-wallet-session"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

export default function ProfilePage() {
    const { user, connectedAccount } = useWalletSession()

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
                <p className="text-muted-foreground">Manage your personal information and account details.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>User Details</CardTitle>
                        <CardDescription>Your account information.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarFallback className="text-lg">{user?.name?.slice(0, 2).toUpperCase() || "JD"}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="text-lg font-semibold">{user?.name || "Guest User"}</h3>
                                <p className="text-sm text-muted-foreground">{user?.email || "No email connected"}</p>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex justify-between py-2 border-b">
                                <span className="font-medium">Username</span>
                                <span className="text-muted-foreground">{user?.username || "Not set"}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="font-medium">Role</span>
                                <Badge variant="outline">{user?.role || "User"}</Badge>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="font-medium">Status</span>
                                <Badge variant={user?.is_verified ? "default" : "secondary"}>
                                    {user?.is_verified ? "Verified" : "Unverified"}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Wallet Connection</CardTitle>
                        <CardDescription>Your linked blockchain wallet.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 rounded-lg bg-muted/50 border">
                            <h4 className="text-sm font-semibold mb-2">Registered Wallet</h4>
                            <code className="text-xs bg-background p-2 rounded block break-all">
                                {user?.wallet_address || "No wallet linked to profile"}
                            </code>
                        </div>

                        <div className="p-4 rounded-lg bg-muted/50 border">
                            <h4 className="text-sm font-semibold mb-2">Active Session</h4>
                            <code className="text-xs bg-background p-2 rounded block break-all">
                                {connectedAccount || "Wallet not connected"}
                            </code>
                            {connectedAccount && user?.wallet_address && connectedAccount.toLowerCase() !== user.wallet_address.toLowerCase() && (
                                <p className="text-xs text-destructive mt-2 font-medium">
                                    ⚠️ Mismatch detected. Please switch accounts.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
