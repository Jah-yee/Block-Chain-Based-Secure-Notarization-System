"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">Manage your application preferences and notifications.</p>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Notifications</CardTitle>
                        <CardDescription>Configure how you receive alerts.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between space-x-2">
                            <div className="flex flex-col space-y-1">
                                <Label htmlFor="email-notifs">Email Notifications</Label>
                                <span className="text-xs text-muted-foreground">Receive updates about your document status via email.</span>
                            </div>
                            <Switch id="email-notifs" defaultChecked />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <div className="flex flex-col space-y-1">
                                <Label htmlFor="marketing-emails">Marketing Emails</Label>
                                <span className="text-xs text-muted-foreground">Receive news and special offers from BBSNS.</span>
                            </div>
                            <Switch id="marketing-emails" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Appearance</CardTitle>
                        <CardDescription>Customize the look and feel of the application.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between space-x-2">
                            <div className="flex flex-col space-y-1">
                                <Label htmlFor="compact-mode">Compact Mode</Label>
                                <span className="text-xs text-muted-foreground">Reduce spacing in lists and tables.</span>
                            </div>
                            <Switch id="compact-mode" />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button>Save Preferences</Button>
                </div>
            </div>
        </div>
    )
}
