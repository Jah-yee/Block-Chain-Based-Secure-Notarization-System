import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Shield, ShieldAlert, CheckCircle2, Loader2, Wallet, LogIn, UserPlus, Fingerprint } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.bbsns.online";
const GENESIS_ACTIVATION_ADDRESS = import.meta.env.VITE_GENESIS_ACTIVATION_ADDRESS;
const GENESIS_NFT_ADDRESS = import.meta.env.VITE_GENESIS_NFT_ADDRESS;

type AppStatus = "loading" | "ready" | "signing" | "authorized" | "expired" | "error" | "genesis-check" | "genesis-activate" | "onboarding";

function App() {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [config, setConfig] = useState<any>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/system/config`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("Config fetch failed:", err);
    }
    return null;
  }, []);
  
  // Genesis states
  const [hasGenesisNFT, setHasGenesisNFT] = useState(false);
  const [isActivatingTx, setIsActivatingTx] = useState(false);
  
  // Onboarding states
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");

  const checkSystemStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/system-status`);
      if (res.ok) {
        const data = await res.json();
        return { activated: data.activated, dbUserCount: data.dbUserCount };
      }
    } catch (err) {
      console.error("System status check failed:", err);
    }
    return null;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const sid = params.get("sessionId");

    const init = async () => {
      const [statusData, sysConfig] = await Promise.all([
        checkSystemStatus(),
        fetchConfig()
      ]);

      if (sysConfig) {
        setConfig(sysConfig);
      } else {
        setError("Failed to load protocol configuration from backend.");
        setStatus("error");
        return;
      }

      const activated = statusData?.activated;
      const dbUserCount = statusData?.dbUserCount;
      
      if (mode === "genesis") {
        if (activated === true && dbUserCount > 0) {
          setError("System is already fully initialized and has registered administrators.");
          setStatus("error");
        } else {
          setStatus("genesis-check");
        }
        return;
      }

      if (!sid) {
        setError("Session ID missing. Please restart login from the desktop app.");
        setStatus("error");
        return;
      }

      setSessionId(sid);
      fetchSession(sid);
    };

    init();
  }, [checkSystemStatus]);

  const fetchSession = async (sid: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/remote/status/${sid}`);
      if (!res.ok) throw new Error("Session not found or expired.");
      const data = await res.json();

      if (data.status === "expired") {
        setStatus("expired");
      } else if (data.status === "authorized") {
        setStatus("authorized");
      } else {
        setChallenge(data.challenge);
        setStatus("ready");
      }
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      setError("Web3 Wallet not found.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];
      setWalletAddress(address);
      setIsConnected(true);
      setError(null);

      if (status === "genesis-check") {
        const nftContract = new ethers.Contract(config.contracts.genesisNft, ["function balanceOf(address) view returns (uint256)"], provider);
        const balance = await nftContract.balanceOf(address);
        setHasGenesisNFT(Number(balance) > 0);
        
        // Re-check activation for this specific logic
        const statusData = await checkSystemStatus();
        if (statusData?.activated) {
          setStatus("onboarding"); // SKIP activation if already done
        } else {
          setStatus("genesis-activate");
        }
      }
    } catch (err: any) {
      setError("Failed to connect wallet.");
    }
  };

  const handleActivate = async () => {
    if (!isConnected || !walletAddress) return;
    setIsActivatingTx(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contracts.genesisActivation, ["function activate() external"], signer);
      
      const tx = await contract.activate();
      await tx.wait();
      
      setStatus("onboarding");
    } catch (err: any) {
      setError(err.reason || err.message || "Activation failed.");
    } finally {
      setIsActivatingTx(false);
    }
  };

  const fetchNonce = async (address: string, purpose: string = "LOGIN") => {
    const res = await fetch(`${BACKEND_URL}/api/auth/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address, purpose })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to fetch secure nonce");
    }
    const data = await res.json();
    return data.nonce;
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("signing");

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // 1. Fetch Real Server Nonce
      const nonce = await fetchNonce(address, "GENESIS_ONBOARD");

      // 2. Sign strict message
      const message = `Login request for BBSNS: ${nonce}`;
      const signature = await signer.signMessage(message);

      // 3. Submit Onboarding
      const res = await fetch(`${BACKEND_URL}/api/auth/genesis/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          walletAddress: address,
          nationalId,
          signature,
          nonce
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Onboarding failed.");
      }

      setStatus("authorized");
      setTimeout(() => window.close(), 3000);
    } catch (err: any) {
      setError(err.message);
      setStatus("onboarding");
    }
  };

  const handleAuthorize = async (isDirect: boolean = false) => {
    if (!challenge || !sessionId) return;
    setStatus("signing");
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Check if this is a Notarization Payload (EIP-712 formatted)
      let parsedPayload: any = null;
      try {
        if (challenge.includes('"domain"') && challenge.includes('"message"')) {
          parsedPayload = JSON.parse(challenge);
        }
      } catch (e) { /* Not a JSON payload */ }

      if (parsedPayload && isDirect) {
        // DIRECT TRANSACTION (Self-Paid)
        const contractAddr = parsedPayload.domain.verifyingContract;
        const abi = [
          "function recordAction(bytes32,address,uint8,bytes32,bytes32,uint256,uint256,bytes) external"
        ];
        const contract = new ethers.Contract(contractAddr, abi, signer);

        // First, we still need the signature even for direct transacting
        const signature = await signer.signTypedData(
          parsedPayload.domain,
          parsedPayload.types,
          parsedPayload.message
        );

        const m = parsedPayload.message;
        const tx = await contract.recordAction(
          m.docHash,
          m.ownerAddress,
          m.status,
          m.summaryHash,
          m.rejectionReasonHash,
          m.timestamp,
          m.nonce,
          signature
        );
        await tx.wait();
        
        // Notify backend that it's done so it can update status
        const res = await fetch(`${BACKEND_URL}/api/auth/remote/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress: address, signature: "DIRECT_TX_CONFIRMED" })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to notify backend of transaction");
        }
      } else if (parsedPayload) {
        // GASLESS (Relayer-Managed)
        const signature = await signer.signTypedData(
          parsedPayload.domain,
          parsedPayload.types,
          parsedPayload.message
        );

        const res = await fetch(`${BACKEND_URL}/api/auth/remote/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress: address, signature })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Authorization failed on server");
        }
      } else {
        // STANDARD LOGIN
        console.log(`[AUTH] Attempting Standard Authorize for sessionId: ${sessionId}`);
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const signature = await signer.signMessage(challenge);

        // 🛡️ Always use absolute URL for remote auth (Bypass potential path misinterpretation)
        const API_BASE = import.meta.env.VITE_BACKEND_URL || "https://api.bbsns.online";
        const res = await fetch(`${API_BASE}/api/auth/remote/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress: address, signature })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Login authorization failed on server");
        }
      }

      setStatus("authorized");
      setTimeout(() => window.close(), 3000);
    } catch (err: any) {
      setError(err.reason || err.message);
      setStatus("error");
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
        <Shield size={64} className="icon-pulse" color={status === "error" ? "var(--error)" : "var(--primary)"} />
      </div>

      <h1>BBSNS {status.startsWith("genesis") || status === "onboarding" ? "Initialization" : "Remote Auth"}</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        {status === "onboarding" ? "Setting up Genesis Admin Identity" : "Secure Handshake for Protocol Operations"}
      </p>

      {status === "loading" && <div className="status-spinner" />}

      {status === "genesis-check" && (
        <div className="view-container">
          <div className="alert alert-info">
            <strong>System Not Initialized</strong><br/>
            Connect the wallet holding the Genesis NFT to activate the protocol.
          </div>
          <button className="button" onClick={connectWallet}>
            <Wallet size={18} style={{ marginRight: "10px" }} />
            Connect Admin Wallet
          </button>
        </div>
      )}

      {status === "genesis-activate" && (
        <div className="view-container">
          <div className="address-chip" style={{ marginBottom: "1rem" }}>{walletAddress}</div>
          {!hasGenesisNFT ? (
            <div className="alert alert-error">
              <ShieldAlert size={18} style={{ marginRight: "8px" }} />
              Wallet does not contain the Genesis NFT.
            </div>
          ) : (
            <button className="button" onClick={handleActivate} disabled={isActivatingTx}>
              {isActivatingTx ? <Loader2 className="animate-spin" /> : <Fingerprint size={18} style={{ marginRight: "10px" }} />}
              Initialize BBSNS Genesis
            </button>
          )}
        </div>
      )}

      {status === "onboarding" && (
        <form onSubmit={handleOnboarding} className="onboarding-form">
          <div className="form-group">
            <label>Full Legal Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. John Doe" required />
          </div>
          <div className="form-group">
            <label>Professional Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@org.com" required />
          </div>
          <div className="form-group">
            <label>Government National ID</label>
            <input type="text" value={nationalId} onChange={e => setNationalId(e.target.value)} placeholder="For on-chain KYC link" required />
          </div>
          <button type="submit" className="button" style={{ marginTop: "1rem" }}>
            <UserPlus size={18} style={{ marginRight: "10px" }} />
            Complete Onboarding
          </button>
        </form>
      )}

      {status === "ready" && (
        <div className="view-container">
          <div className="alert alert-info" style={{ fontSize: "0.85rem" }}>
            Confirming session: <code>{sessionId}</code>
          </div>
          {!isConnected ? (
            <button className="button" onClick={connectWallet}>
              <Wallet size={18} style={{ marginRight: "10px" }} />
              Connect Wallet
            </button>
          ) : (
            <>
              <div className="address-chip" style={{ marginBottom: "1rem" }}>{walletAddress}</div>
              {challenge?.includes('"domain"') ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button className="button" onClick={() => handleAuthorize(false)}>
                    <LogIn size={18} style={{ marginRight: "10px" }} />
                    Approve (Gasless)
                  </button>
                  <button className="button outline" onClick={() => handleAuthorize(true)} style={{ borderColor: 'var(--primary)' }}>
                    <Shield size={18} style={{ marginRight: "10px" }} />
                    Approve & Pay Gas
                  </button>
                </div>
              ) : (
                <button className="button" onClick={() => handleAuthorize(false)}>
                  <LogIn size={18} style={{ marginRight: "10px" }} />
                  Authorize Session
                </button>
              )}
            </>
          )}
        </div>
      )}

      {status === "signing" && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <div className="status-spinner" />
          <p style={{ color: "var(--primary)", fontWeight: "600", marginTop: "1rem" }}>Check MetaMask</p>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Securely signing challenge...</span>
        </div>
      )}

      {status === "authorized" && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <CheckCircle2 size={64} color="var(--primary)" style={{ margin: "0 auto 1.5rem" }} />
          <h2 style={{ color: "var(--primary)", marginBottom: "0.5rem" }}>Operation Successful!</h2>
          <p style={{ color: "var(--muted)" }}>You can now return to the desktop app.</p>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontStyle: "italic" }}>Closing in 3 seconds...</span>
        </div>
      )}

      {(status === "expired" || status === "error") && (
        <div className="alert alert-error">
          <ShieldAlert size={18} style={{ marginRight: "8px" }} />
          {error || "Session expired. Please restart."}
        </div>
      )}
    </div>
  );
}

export default App;
