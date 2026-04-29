import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Shield, ShieldAlert, CheckCircle2, Loader2, Wallet, LogIn, UserPlus, Fingerprint } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.bbsns.online";

type AppStatus = "loading" | "ready" | "signing" | "authorized" | "expired" | "error" | "genesis-check" | "genesis-activate" | "onboarding";

function App() {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [handshakeDomain, setHandshakeDomain] = useState<any>(null);
  const [handshakeTypes, setHandshakeTypes] = useState<any>(null);
  const [notarizeMetadata, setNotarizeMetadata] = useState<any>(null);

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

    const allowedModes = ["login", "genesis", "notarize"];

    const init = async () => {
      // 1. HARD INPUT VALIDATION
      if (!mode) {
        setError("Missing protocol mode parameter (mode).");
        setStatus("error");
        return;
      }

      if (!sid) {
        setError("Missing session identifier (sessionId).");
        setStatus("error");
        return;
      }

      if (!allowedModes.includes(mode)) {
        setError(`Invalid protocol mode: ${mode}`);
        setStatus("error");
        return;
      }

      // 2. FRESH AUTHORITY SYNC (Fresh from backend)
      const [statusData, sysConfig] = await Promise.all([
        checkSystemStatus(),
        fetchConfig()
      ]);

      if (!sysConfig) {
        setError("Failed to load protocol configuration from backend authority.");
        setStatus("error");
        return;
      }
      setConfig(sysConfig);

      const systemInitialized = statusData?.activated === true && (statusData?.dbUserCount || 0) > 0;

      // 3. DETERMINISTIC STATE MACHINE
      console.log(`[PROTOCOL] Mode: ${mode} | Initialized: ${systemInitialized} | Session: ${sid}`);

      switch (mode) {
        case "login":
        case "notarize":
          if (!systemInitialized) {
            setError(`Protocol violation: ${mode} requested, but system is not yet initialized. Use Genesis first.`);
            setStatus("error");
          } else {
            setSessionId(sid);
            fetchSession(sid);
          }
          break;

        case "genesis":
          if (systemInitialized) {
            setError("Protocol violation: Genesis requested, but system is already fully initialized.");
            setStatus("error");
          } else {
            setStatus("genesis-check");
          }
          break;

        default:
          setError("Unrecognized protocol state.");
          setStatus("error");
          break;
      }
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
        
        // 🛡️ [Hardening] Detect Notarization Context
        if (data.challenge && data.challenge.startsWith('{')) {
          try {
            const parsed = JSON.parse(data.challenge);
            if (parsed.docHash) {
              setNotarizeMetadata(parsed);
              console.log("[AUTH] Notarization metadata detected:", parsed);
            }
          } catch (e) {
            console.warn("[AUTH] Challenge look like JSON but failed to parse:", e);
          }
        }

        if (data.handshakeDomain) setHandshakeDomain(data.handshakeDomain);
        if (data.handshakeTypes) setHandshakeTypes(data.handshakeTypes);
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

      // 2. Sign strict message (Canonical Protocol Format)
      const message = `BBSNS::GENESIS_ONBOARD::v1::${nonce}::${address.toLowerCase()}`;
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
      } else if (notarizeMetadata) {
        // 🛡️ [Step B] Notarize-Mode EIP-712 Signing
        console.log(`[AUTH] Initiating Notarization Signing for doc: ${notarizeMetadata.docHash}`);
        
        const domain = {
          name: "BBSNS_Protocol",
          version: "1",
          chainId: config.chainId,
          verifyingContract: config.contracts.documentRegistry
        };

        const types = {
          Notarize: [
            { name: 'docHash', type: 'bytes32' },
            { name: 'ownerAddress', type: 'address' },
            { name: 'status', type: 'uint8' },
            { name: 'summaryHash', type: 'bytes32' },
            { name: 'rejectionReasonHash', type: 'bytes32' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'nonce', type: 'uint256' }
          ]
        };

        const message = {
          ...notarizeMetadata,
          status: Number(notarizeMetadata.status),
          timestamp: Number(notarizeMetadata.timestamp),
          nonce: BigInt(notarizeMetadata.nonce).toString()
        };

        console.log("[AUTH] Signing Notarize Payload:", { domain, types, message });
        
        const signature = await signer.signTypedData(domain, types, message);
        console.log("[AUTH] Notarization signature obtained. Relaying to authority...");

        const bindRes = await fetch(`${BACKEND_URL}/api/auth/remote/atomic-bind`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            signature,
            walletAddress: address,
            timestamp: notarizeMetadata.timestamp
          })
        });

        if (!bindRes.ok) {
          const data = await bindRes.json().catch(() => ({}));
          throw new Error(data.error || "Notarization Relay Failed");
        }

        setStatus("authorized");
        setTimeout(() => window.close(), 3000);
      } else if (handshakeDomain && handshakeTypes) {
        // 🛡️ [Hardening 11.3] Atomic Single-Signature Handshake
        console.log(`[AUTH] Initiating Atomic Handshake for sessionId: ${sessionId}`);
        
        const timestamp = Math.floor(Date.now() / 1000);
        const message = {
          action: 'Remote Login Authorization',
          sessionId: sessionId,
          challenge: challenge,
          timestamp: timestamp
        };

        let signature;
        try {
          signature = await signer.signTypedData(handshakeDomain, handshakeTypes, message);
        } catch (signErr: any) {
          console.error("[AUTH_FAIL] Atomic signing failed:", signErr);
          setError(`Single-signature failed: ${signErr.message}. Falling back to Legacy mode...`);
          setHandshakeDomain(null);
          setHandshakeTypes(null);
          return;
        }

        const bindRes = await fetch(`${BACKEND_URL}/api/auth/remote/atomic-bind`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            signature,
            walletAddress: address,
            timestamp
          })
        });

        if (!bindRes.ok) {
          const data = await bindRes.json().catch(() => ({}));
          throw new Error(data.error || "Atomic Binding Evaluation Failed");
        }

        setStatus("authorized");
        setTimeout(() => window.close(), 3000);
      } else {
        // Standard Identity Binding Flow
        console.log(`[AUTH] Falling back to Legacy Dual-Signature flow for sessionId: ${sessionId}`);
        
        const nonce = await fetchNonce(address, "LOGIN");
        const message = `BBSNS::LOGIN::v1::${nonce}::${address.toLowerCase()}`;
        const signature = await signer.signMessage(message);

        const API_BASE = import.meta.env.VITE_BACKEND_URL || "https://api.bbsns.online";

        const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            signature,
            nonce
          })
        });

        if (!loginRes.ok) {
          const data = await loginRes.json().catch(() => ({}));
          throw new Error(data.error || "Portal Identity Verification Failed");
        }

        const { token } = await loginRes.json();
        const handshakeSignature = await signer.signMessage(challenge!);

        const authRes = await fetch(`${API_BASE}/api/auth/remote/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sessionId, 
            walletAddress: address, 
            signature: handshakeSignature 
          })
        });

        if (!authRes.ok) {
          const data = await authRes.json().catch(() => ({}));
          throw new Error(data.error || "Handshake Authorization Failed");
        }

        const bindRes = await fetch(`${API_BASE}/api/auth/remote/complete`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId })
        });

        if (!bindRes.ok) {
          const data = await bindRes.json().catch(() => ({}));
          throw new Error(data.error || "Identity Binding Failed");
        }

        setStatus("authorized");
        setTimeout(() => window.close(), 3000);
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

          {notarizeMetadata && (
            <div className="bg-muted/50 rounded-xl p-4 mb-4" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                <Shield size={18} color="var(--primary)" />
                <span style={{ fontWeight: '600', color: 'var(--primary)' }}>Document Notarization</span>
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>File Hash</span>
                  <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{notarizeMetadata.docHash}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>Owner</span>
                  <code style={{ fontSize: '0.7rem' }}>{notarizeMetadata.ownerAddress}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ color: 'var(--muted)' }}>Action</span>
                  <span style={{ 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.7rem',
                    background: notarizeMetadata.status === 1 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: notarizeMetadata.status === 1 ? '#10b981' : '#ef4444',
                    border: notarizeMetadata.status === 1 ? '1px solid #10b98133' : '1px solid #ef444433'
                  }}>
                    {notarizeMetadata.status === 1 ? 'APPROVE' : 'REJECT'}
                  </span>
                </div>
              </div>
            </div>
          )}
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
