import { useState, useEffect } from "react";
import { Lock, ShieldCheck, AlertCircle, Globe, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { toast } from "sonner";
import api from "../../services/api";
import { useConfig } from "../../contexts/ConfigAuthority";

interface AdminLoginProps {
  onLogin: () => void;
  onBack: () => void;
}

export function AdminLogin({ onLogin, onBack }: AdminLoginProps) {
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<"idle" | "awaiting_browser" | "authorized" | "expired">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 🛡️ [SECURITY] Hardened Status Listener
  useEffect(() => {
    if ((window as any).electronAPI?.auth) {
      (window as any).electronAPI.auth.onStatusChanged((data: any) => {
        if (data.status === "authorized") {
          setStatus("authorized");
          toast.success("Login Successful!");
          onLogin();
        } else if (data.status === "expired" || data.status === "failed") {
          setStatus("expired");
          setError("Session expired or authorization failed.");
        }
      });
    }
  }, [onLogin]);

  const handleStartRemoteAuth = async () => {
    setConnecting(true);
    setError("");
    setStatus("idle");

    try {
      // 🛡️ [SECURITY] OS-Level Auth Initiation
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.auth) throw new Error("Security bridge failure: auth:start missing.");

      const { sessionId } = await electronAPI.auth.start();
      setSessionId(sessionId);
      setStatus("awaiting_browser");

      toast.info("Browser opened. Please sign the challenge in your wallet.");
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("403") || err.message.toLowerCase().includes("not activated")) {
        setError("SYSTEM_NOT_ACTIVATED");
      } else {
        setError(err.message || "Failed to start secure login.");
      }
      toast.error("Process Halted");
      setStatus("idle");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A2540] via-[#0D1B2A] to-[#0A2540] flex">
      {/* Left Side - Visual */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-32 h-32 bg-emerald-500/20 rounded-3xl mb-8 shadow-2xl shadow-emerald-500/20">
            <Lock className="w-16 h-16 text-emerald-400" />
          </div>
          <h2 className="text-emerald-400 mb-4">Secure Admin Access</h2>
          <p className="text-gray-400 max-w-md">
            Non-custodial login via Browser. Authenticate securely with MetaMask and return here to manage the network.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="mb-8 text-center sm:text-left">
              <h1 className="text-emerald-400 mb-2">Admin Login</h1>
              <p className="text-gray-400">Remote Blockchain Authentication</p>
            </div>

            <div className="space-y-6">

              {/* Error Message */}
              {error === "SYSTEM_NOT_ACTIVATED" ? (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3">
                   <div className="flex items-center gap-2 text-amber-500">
                     <AlertCircle className="h-5 w-5" />
                     <span className="font-bold">System Setup Required</span>
                   </div>
                   <p className="text-xs text-amber-400/80 leading-relaxed">
                     The BBSNS protocol has not been activated on-chain yet. Please contact the Genesis Admin or use the "Initialize System" module to activate the network before trying to log in.
                   </p>
                   <Button variant="outline" size="sm" onClick={onBack} className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                      Go Back
                   </Button>
                </div>
              ) : error && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Status Section */}
              {status === "awaiting_browser" ? (
                <div className="flex flex-col items-center justify-center p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-4">
                  <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-emerald-400 font-medium">Awaiting Authorization</p>
                    <p className="text-xs text-gray-400 mt-1">Please complete the signing in your browser...</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatus("idle")}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    Cancel
                  </Button>
                </div>
              ) : status === "authorized" ? (
                <div className="flex flex-col items-center justify-center p-6 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-blue-400" />
                  <p className="text-blue-300 font-medium">Session Authorized</p>
                  <p className="text-xs text-gray-500">Redirecting to dashboard...</p>
                </div>
              ) : (
                <Button
                  onClick={handleStartRemoteAuth}
                  disabled={connecting}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl h-14 text-lg font-medium shadow-lg hover:shadow-emerald-500/20 transition-all duration-300 group"
                >
                  {connecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Globe className="mr-2 group-hover:scale-110 transition-transform" size={24} />
                      Login via Browser
                    </>
                  )}
                </Button>
              )}

              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <ShieldCheck className="text-blue-400 mt-0.5 shrink-0" size={20} />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-300">Browser Handshake</p>
                  <p className="text-xs text-blue-400/80 leading-relaxed">
                    This method uses a secure proxy to bridge Electron with your system browser, keeping your private keys isolated within the MetaMask environment.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Back Link */}
          <div className="mt-6 text-center">
            <button
              onClick={onBack}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to role selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
