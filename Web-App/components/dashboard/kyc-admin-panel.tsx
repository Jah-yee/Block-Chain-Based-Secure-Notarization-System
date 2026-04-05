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

export function KYCAdminPanel() {
    const [users, setUsers] = useState<User[]>([])
    const [isLoading, setIsLoading] = useState(true)
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

    useEffect(() => {
        fetchUsers()
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

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>User Management & KYC Audit</CardTitle>
                    <CardDescription>Manage user roles and verify identities for Notary authorization</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2 mb-6">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, email, or wallet..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="max-w-md"
                        />
                    </div>

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
        </div>
    )
}
