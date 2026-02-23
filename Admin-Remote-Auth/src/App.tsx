import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Shield, ShieldAlert, CheckCircle2, Loader2, Wallet, LogIn } from "lucide-react";

const BACKEND_URL = "http://localhost:5000";

function App() {
  const [status, setStatus] = useState<"loading" | "ready" | "signing" | "authorized" | "expired" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sessionId");

    if (!sid) {
      setError("Session ID missing. Please restart login from the desktop app.");
      setStatus("error");
      return;
    }
    setSessionId(sid);
    fetchSession(sid);
  }, []);

  const fetchSession = async (sid: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/remote/status/${sid}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Session not found or expired.");
        throw new Error("Failed to load session details.");
      }
      const data = await res.json();

      if (data.status === "expired") {
        setStatus("expired");
        return;
      }

      if (data.status === "authorized") {
        setStatus("authorized");
        return;
      }

      setChallenge(data.challenge);
      setStatus("ready");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      setError("MetaMask not found. Please install it to continue.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setWalletAddress(accounts[0]);
      setIsConnected(true);
    } catch (err: any) {
      setError("Failed to connect wallet.");
    }
  };

  const handleAuthorize = async () => {
    if (!challenge || !sessionId) return;

    setStatus("signing");
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const signature = await signer.signMessage(challenge);

      const res = await fetch(`${BACKEND_URL}/api/auth/remote/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          walletAddress: address,
          signature
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authorization failed.");
      }

      setStatus("authorized");
      setTimeout(() => window.close(), 3000);
    } catch (err: any) {
      setError(err.message);
      setStatus("ready");
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
        <Shield size={48} color="var(--primary)" />
      </div>

      <h1>BBSNS Remote Auth</h1>
      <p>Secure Handshake for BBSNS Desktop</p>

      {status === "loading" && <div className="status-spinner" />}

      {status === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="alert alert-info" style={{ textAlign: "center" }}>
            Ready to authorize session: <br />
            <code style={{ fontSize: "0.7rem" }}>{sessionId}</code>
          </div>

          {!isConnected ? (
            <button className="button" onClick={connectWallet}>
              <Wallet size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
              Connect Wallet
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <span className="label">Signing Account</span>
                <div className="address-chip">{walletAddress}</div>
              </div>
              <button className="button" onClick={handleAuthorize}>
                <LogIn size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
                Authorize Desktop
              </button>
            </div>
          )}
        </div>
      )}

      {status === "signing" && (
        <div style={{ textAlign: "center" }}>
          <div className="status-spinner" />
          <p style={{ color: "var(--primary)", fontWeight: "bold" }}>Check MetaMask</p>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Signing authorization challenge...</span>
        </div>
      )}

      {status === "authorized" && (
        <div style={{ textAlign: "center" }}>
          <CheckCircle2 size={48} color="var(--primary)" style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ color: "var(--primary)" }}>Authorized!</h2>
          <p>You can now return to the desktop app.</p>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Closing in 3 seconds...</span>
        </div>
      )}

      {status === "expired" && (
        <div className="alert alert-error">
          <ShieldAlert size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
          Session expired. Please restart login from the desktop.
        </div>
      )}

      {status === "error" && (
        <div className="alert alert-error">
          <ShieldAlert size={18} style={{ verticalAlign: "middle", marginRight: "8px" }} />
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
