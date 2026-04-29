import { User, Shield, Wallet, RefreshCw, CheckCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

interface ProfileProps {
  user: any;
}

export function Profile({ user }: ProfileProps) {
  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0D1B2A]">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }

  const profileData = {
    name: user.name || "User",
    email: user.email || "N/A",
    wallet: user.wallet_address || "N/A",
    kycStatus: user.kyc_verified ? "Verified" : "Pending",
    role: user.role || "N/A"
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e]">
      {/* Header */}
      <div className="flex-none border-b border-border bg-background/95 backdrop-blur-sm z-20 shadow-sm p-8 pt-12 pb-6">
        <div>
          <h1 className="text-foreground mb-1">My Profile</h1>
          <p className="text-sm text-muted-foreground">View and manage your {profileData.role} profile information</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar">
        {/* Profile Header */}
        <Card className="bg-card/50 border-border rounded-xl p-8">
          <div className="flex items-start gap-6">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <User className="w-12 h-12 text-white" />
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-foreground mb-2">{profileData.name}</h2>
                  <p className="text-sm text-muted-foreground">{profileData.role === 'admin' ? 'Administrator' : 'Certified Notary'}</p>
                </div>
                <Badge className={`${user.kyc_verified ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-500 dark:border-emerald-500/30" : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-500 dark:border-yellow-500/30"} flex items-center gap-2`}>
                  {user.kyc_verified ? <CheckCircle size={14} /> : <RefreshCw size={14} className="animate-spin" />}
                  {profileData.kycStatus}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Email Address</p>
                  <p className="text-sm text-foreground">{profileData.email}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Role Type</p>
                  <p className="text-sm text-primary capitalize">{profileData.role}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Information Cards */}
        <div className="grid grid-cols-2 gap-6">
          {/* Personal Information */}
          <Card className="bg-card/50 border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="text-primary" size={20} />
              <h3 className="text-foreground">Account Information</h3>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Full Name</p>
                <p className="text-sm text-foreground">{profileData.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="text-sm text-foreground font-mono">{profileData.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">KYC Status</p>
                <Badge className={`${user.kyc_verified ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-500 dark:border-emerald-500/30" : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-500 dark:border-yellow-500/30"}`}>
                  {user.kyc_verified ? <CheckCircle size={12} className="mr-1" /> : <RefreshCw size={12} className="mr-1 mt-1 animate-spin" />}
                  {profileData.kycStatus}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Blockchain Information */}
          <Card className="bg-card/50 border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="text-primary" size={20} />
              <h3 className="text-foreground">Blockchain Wallet</h3>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
                <p className="text-xs text-foreground font-mono break-all">{profileData.wallet}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Network Access</p>
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-500 dark:border-blue-500/30">
                  Global BBSNS Protocol
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Connection Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-500">Authenticated Session</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Security Notice */}
        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-500/5 dark:border-blue-500/20 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <Shield className="text-blue-600 dark:text-blue-500 mt-0.5 shrink-0" size={20} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Security Invariant</p>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                This desktop terminal is uniquely bound to your hardware signature and wallet. Attempting to log in from an unauthorized device will trigger a security lock.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
