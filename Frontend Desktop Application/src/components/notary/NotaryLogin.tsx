import { useState, useEffect } from "react";
import { User, Shield, Globe, ArrowRight, CheckCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api from "../../services/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Alert, AlertDescription } from "../ui/alert";
import { useConfig } from "../../contexts/ConfigAuthority";

interface NotaryLoginProps {
  onLogin: () => void;
  onBack: () => void;
}

export function NotaryLogin({ onLogin, onBack }: NotaryLoginProps) {
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [authStatus, setAuthStatus] = useState<"idle" | "awaiting_browser" | "authorized" | "expired">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const progress = (step / 3) * 100;

  // 🛡️ [SECURITY] Hardened Status Listener
  useEffect(() => {
    if ((window as any).electronAPI?.auth) {
      (window as any).electronAPI.auth.onStatusChanged((data: any) => {
        if (data.status === "authorized") {
          const userRole = String(data.user.role).toLowerCase();
          if (userRole === "2" || userRole === "3" || userRole === "notary" || userRole === "admin") { // Notary or Admin
            setAuthStatus("authorized");
            toast.success("Login Successful!");
            onLogin();
          } else {
            setError("Access Denied: Your wallet is not authorized as a Notary.");
            setAuthStatus("idle");
          }
        } else if (data.status === "expired" || data.status === "failed") {
          setAuthStatus("expired");
          setError("Session expired. Please try again.");
        }
      });
    }
  }, [onLogin]);

  const handleStep1Next = async () => {
    if (!userId || !password) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${api.baseUrl}/auth/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: userId.toLowerCase().trim(),
          password: password 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Authentication failed");
      }

      if (data.role !== 'notary' && data.role !== 'admin') {
        throw new Error("Unauthorized: This account is not a Notary or Admin.");
      }

      setStep(2);
      toast.success("Credentials Verified");
    } catch (err: any) {
      setError(err.message || "Failed to verify credentials.");
      toast.error("Auth Failure");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Verify = async () => {
    if (!nationalId) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${api.baseUrl}/auth/verify-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: userId.toLowerCase().trim(),
          nationalId: nationalId
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Identity verification failed");
      }

      setStep(3);
      toast.success("Identity Verified Sucessfully");
    } catch (err: any) {
      setError(err.message || "Failed to verify identity");
      toast.error("Verification Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStartRemoteAuth = async () => {
    setLoading(true);
    setError("");
    setAuthStatus("idle");

    try {
      // 🛡️ [SECURITY] OS-Level Auth Initiation
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.auth) throw new Error("Security bridge failure: auth:start missing.");

      const { sessionId } = await electronAPI.auth.start();
      setSessionId(sessionId);
      setAuthStatus("awaiting_browser");

      toast.info("Browser opened. Please sign the challenge.");
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("403") || err.message.toLowerCase().includes("activation required")) {
        setError("ACCOUNT_NOT_ACTIVATED");
      } else if (err.message.toLowerCase().includes("not activated")) {
        setError("SYSTEM_NOT_ACTIVATED");
      } else {
        setError(err.message || "Failed to start secure login.");
      }
      setAuthStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Step {step} of 3</span>
            <span className="text-sm text-primary">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-secondary" />
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          {/* Step Indicators */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${s < step
                  ? "bg-primary border-primary text-primary-foreground"
                  : s === step
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "bg-muted border-muted-foreground/30 text-muted-foreground"
                  }`}
              >
                {s < step ? <CheckCircle size={20} /> : s}
              </div>
            ))}
          </div>

          {error === "SYSTEM_NOT_ACTIVATED" ? (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3 mb-6">
               <div className="flex items-center gap-2 text-amber-500 text-sm font-bold">
                 <AlertCircle className="h-4 w-4" />
                 <span>Protocol Activation Required</span>
               </div>
               <p className="text-[10px] text-amber-500/80 leading-relaxed">
                 The BBSNS protocol has not been activated on-chain yet. Please contact your Genesis Admin to activate the network.
               </p>
            </div>
          ) : error === "ACCOUNT_NOT_ACTIVATED" ? (
            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl space-y-3 mb-6">
               <div className="flex items-center gap-2 text-blue-500 text-sm font-bold">
                 <AlertCircle className="h-4 w-4" />
                 <span>Account Activation Required</span>
               </div>
               <p className="text-[10px] text-blue-400/80 leading-relaxed">
                 Your application has been approved, but your account is not yet activated. Please check your email for the activation link to set your secure password.
               </p>
               <Button variant="outline" size="sm" onClick={() => setStep(1)} className="w-full border-blue-500/30 text-blue-500 hover:bg-blue-500/10 text-xs">
                  Back to Login
               </Button>
            </div>
          ) : error && (
            <Alert variant="destructive" className="mb-6 bg-red-50 dark:bg-destructive/10 border-red-200 dark:border-destructive/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs text-red-800 dark:text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: User Credentials */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-500/10 rounded-2xl mb-4">
                  <User className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                </div>
                <h2 className="text-blue-600 dark:text-blue-500 mb-2">Notary Login</h2>
                <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="userId" className="text-muted-foreground">User ID</Label>
                  <Input
                    id="userId"
                    type="email"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Enter your registered email"
                    className="bg-background border-input text-foreground mt-2 h-11"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="text-muted-foreground">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="bg-background border-input text-foreground mt-2 h-11"
                  />
                </div>

                <Button
                  onClick={handleStep1Next}
                  disabled={!userId || !password || loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 mt-6"
                >
                  {loading ? "Verifying..." : "Next"}
                  <ArrowRight className="ml-2" size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: National ID Verification */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-500/10 rounded-2xl mb-4">
                  <Shield className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                </div>
                <h2 className="text-blue-600 dark:text-blue-500 mb-2">Verify National ID</h2>
                <p className="text-sm text-muted-foreground">Confirm your identity with National ID</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="nationalId" className="text-muted-foreground">National ID</Label>
                  <Input
                    id="nationalId"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                    placeholder="Enter your national ID"
                    className="bg-background border-input text-foreground mt-2 h-11"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-500">
                    Your National ID will be verified against blockchain records.
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="flex-1 border-border text-muted-foreground hover:bg-muted rounded-xl h-11"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleStep2Verify}
                    disabled={!nationalId || loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11"
                  >
                    Verify
                    <ArrowRight className="ml-2" size={16} />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Remote Wallet Connect */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 dark:bg-emerald-500/10 rounded-2xl mb-4">
                  <Globe className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
                </div>
                <h2 className="text-emerald-600 dark:text-emerald-500 mb-2">Authorize in Browser</h2>
                <p className="text-sm text-muted-foreground">Blockchain identity verification</p>
              </div>

              <div className="space-y-4">
                {authStatus === "awaiting_browser" ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-xl space-y-4 text-center">
                    <div className="w-12 h-12 border-4 border-emerald-200 dark:border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    <div>
                      <p className="text-emerald-700 dark:text-emerald-500 font-medium">Waiting for signature...</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Please finish authorization in your system browser.</p>
                    </div>
                  </div>
                ) : authStatus === "authorized" ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-xl space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-blue-600 dark:text-blue-500" />
                    <p className="text-blue-700 dark:text-blue-500 font-medium">Identity Verified</p>
                  </div>
                ) : (
                  <Button
                    onClick={handleStartRemoteAuth}
                    disabled={loading}
                    variant="default"
                    className="w-full rounded-xl h-12 gap-2"
                  >
                    <Globe size={20} />
                    Open Browser to Sign
                  </Button>
                )}

                <Button
                  onClick={() => setStep(2)}
                  variant="outline"
                  disabled={authStatus === "awaiting_browser"}
                  className="w-full border-border text-muted-foreground hover:bg-muted rounded-xl h-11"
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Back & Apply Links */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to role selection
          </button>


        </div>
      </div>
    </div >
  );
}
