"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle, XCircle, UserCheck, Shield, Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient } from "@/lib/api-client"

interface User {
    id: string
    name: string
    email: string
    wallet_address: string
    role: 'admin' | 'notary' | 'user'
    liveness_status: string
    kyc_verified: boolean
}

interface NotaryApplication {
    application_id: string
    name: string
    email: string
    wallet_address: string
    license_number: string
    status: 'pending' | 'verified' | 'approved' | 'activated' | 'rejected'
    application_date: string
}

export function KYCAdminPanel() {
    const [users, setUsers] = useState<User[]>([])
    const [applications, setApplications] = useState<NotaryApplication[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAppLoading, setIsAppLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [isUpdating, setIsUpdating] = useState<string | null>(null)
    const { toast } = useToast()

    const fetchUsers = async () => {
        setIsLoading(true)
        try {
            const data = await apiClient.get('/users')
            setUsers(data)
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Could not fetch user list.",
                variant: "destructive",
            })
        } finally {
            setIsLoading(false)
        }
    }

    const fetchApplications = async () => {
        setIsAppLoading(true)
        try {
            const response = await apiClient.get('/notaries/applications')
            setApplications(response.data || [])
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Could not fetch notary applications.",
                variant: "destructive",
            })
        } finally {
            setIsAppLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
        fetchApplications()
    }, [])

    const handleUpdate = async (userId: string, updates: Partial<User>) => {
        setIsUpdating(userId)
        try {
            await apiClient.put(`/users/${userId}`, updates)
            toast({
                title: "Success",
                description: "User updated successfully.",
            })
            await fetchUsers()
        } catch (err: any) {
            toast({
                title: "Update Failed",
                description: err.message,
                variant: "destructive",
            })
        } finally {
            setIsUpdating(null)
        }
    }

    const handleApplicationAction = async (appId: string, action: 'approve' | 'reject') => {
        setIsUpdating(appId)
        try {
            await apiClient.post(`/notaries/applications/${appId}/${action}`)
            toast({
                title: action === 'approve' ? "Approved" : "Rejected",
                description: `Notary application ${action} successfully.`,
            })
            await fetchApplications()
        } catch (err: any) {
            toast({
                title: "Action Failed",
                description: err.message,
                variant: "destructive",
            })
        } finally {
            setIsUpdating(null)
        }
    }

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredApps = applications.filter(app =>
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.wallet_address?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="users">User Management</TabsTrigger>
                    <TabsTrigger value="applications">Notary Applications</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="mt-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>User Management & KYC Audit</CardTitle>
                                    <CardDescription>Manage user roles and verify identities for Notary authorization</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Search className="h-4 w-4 text-muted-foreground mr-2" />
                                    <Input
                                        placeholder="Search users..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="max-w-[200px]"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Wallet</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>KYC Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                    <p className="mt-2 text-sm text-muted-foreground">Loading users...</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredUsers.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                    No users found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredUsers.map((user) => (
                                                <TableRow key={user.id}>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{user.name}</span>
                                                            <span className="text-xs text-muted-foreground">{user.email}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-xs bg-muted px-1 rounded">{user.wallet_address.substring(0, 10)}...</code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select
                                                            defaultValue={user.role}
                                                            onValueChange={(val) => handleUpdate(user.id, { role: val as any })}
                                                            disabled={isUpdating === user.id}
                                                        >
                                                            <SelectTrigger className="w-[120px] h-8 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="user">User</SelectItem>
                                                                <SelectItem value="notary">Notary</SelectItem>
                                                                <SelectItem value="admin">Admin</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={user.kyc_verified ? "default" : "secondary"} className="capitalize">
                                                            {user.kyc_verified ? "Verified" : user.liveness_status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        {!user.kyc_verified && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 text-xs"
                                                                onClick={() => handleUpdate(user.id, { liveness_status: 'verified', kyc_verified: true } as any)}
                                                                disabled={isUpdating === user.id}
                                                            >
                                                                <UserCheck className="h-3 w-3 mr-1" />
                                                                Verify KYC
                                                            </Button>
                                                        )}
                                                        {user.kyc_verified && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 text-xs text-destructive hover:text-destructive"
                                                                onClick={() => handleUpdate(user.id, { liveness_status: 'pending', kyc_verified: false } as any)}
                                                                disabled={isUpdating === user.id}
                                                            >
                                                                Revoke
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="applications" className="mt-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Notary Onboarding & Approval</CardTitle>
                                    <CardDescription>Review and approve professional notary applications</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Search className="h-4 w-4 text-muted-foreground mr-2" />
                                    <Input
                                        placeholder="Search applications..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="max-w-[200px]"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Candidate</TableHead>
                                            <TableHead>Wallet</TableHead>
                                            <TableHead>License</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Governance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isAppLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                    <p className="mt-2 text-sm text-muted-foreground">Loading applications...</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredApps.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                    No applications found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredApps.map((app) => (
                                                <TableRow key={app.application_id}>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{app.name}</span>
                                                            <span className="text-xs text-muted-foreground">{app.email}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-xs bg-muted px-1 rounded">{app.wallet_address?.substring(0, 10)}...</code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs font-mono">{app.license_number}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge 
                                                            variant={
                                                                app.status === 'activated' ? "default" : 
                                                                app.status === 'approved' ? "outline" : 
                                                                app.status === 'rejected' ? "destructive" : "secondary"
                                                            } 
                                                            className="capitalize"
                                                        >
                                                            {app.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        {app.status === 'verified' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    className="h-8 text-xs bg-green-600 hover:bg-green-700"
                                                                    onClick={() => handleApplicationAction(app.application_id, 'approve')}
                                                                    disabled={isUpdating === app.application_id}
                                                                >
                                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                                    Approve
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    className="h-8 text-xs"
                                                                    onClick={() => handleApplicationAction(app.application_id, 'reject')}
                                                                    disabled={isUpdating === app.application_id}
                                                                >
                                                                    <XCircle className="h-3 w-3 mr-1" />
                                                                    Reject
                                                                </Button>
                                                            </>
                                                        )}
                                                        {app.status === 'approved' && (
                                                            <span className="text-xs text-muted-foreground italic">Waiting for activation</span>
                                                        )}
                                                        {app.status === 'activated' && (
                                                            <div className="flex items-center justify-end text-green-600 text-xs font-medium">
                                                                <Shield className="h-3 w-3 mr-1" />
                                                                Active Notary
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
