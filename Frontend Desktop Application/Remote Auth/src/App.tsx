import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Shield, ShieldAlert, CheckCircle2, Loader2, Wallet, LogIn, UserPlus, Fingerprint } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.bbsns.online";

type AppStatus = "loading" | "ready" | "signing" | "cooldown" | "authorized" | "expired" | "error" | "genesis-check" | "genesis-activate" | "onboarding" | "token" | "promote" | "activate";

function App() {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [activationToken, setActivationToken] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [handshakeDomain, setHandshakeDomain] = useState<any>(null);
  const [handshakeTypes, setHandshakeTypes] = useState<any>(null);
  const [notarizeMetadata, setNotarizeMetadata] = useState<any>(null);
  const [governanceMetadata, setGovernanceMetadata] = useState<any>(null);
  const [targetAddress, setTargetAddress] = useState<string | null>(null);
  const [isPromoting, setIsPromoting] = useState(false);
  const [multiStepIndex, _setMultiStepIndex] = useState<number>(0);
  const [multiStepOperations, setMultiStepOperations] = useState<any[]>([]);

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
    let params = new URLSearchParams(window.location.search);
    let mode = params.get("mode");
    let sid = params.get("sessionId");
    let target = params.get("targetAddress");

    if (!mode && window.location.hash) {
      params = new URLSearchParams(window.location.hash.substring(1));
      mode = params.get("mode");
      sid = params.get("sessionId");
      target = params.get("targetAddress");
    }

    const allowedModes = ["login", "genesis", "notarize", "promote", "gov-vote", "gov-submit", "multisig", "activate", "gov-execute"];

    const init = async () => {
      // 1. HARD INPUT VALIDATION
      if (!mode) {
        setError("Missing protocol mode parameter (mode).");
        setStatus("error");
        return;
      }

      // sid is required for all modes EXCEPT genesis, promote, and activate
      if (!sid && !["genesis", "promote", "activate"].includes(mode)) {
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
      setActiveMode(mode);

      switch (mode) {
        case "promote":
          if (!target) {
            setError("Missing targetAddress parameter for promotion.");
            setStatus("error");
          } else {
            setTargetAddress(target);
            setStatus("promote");
          }
          break;

        case "login":
        case "notarize":
        case "gov-vote":
        case "gov-submit":
        case "multisig":
        case "gov-execute":
          if (!systemInitialized) {
            setError(`Protocol violation: ${mode} requested, but system is not yet initialized. Use Genesis first.`);
            setStatus("error");
          } else {
            setSessionId(sid);
            fetchSession(sid!, mode, sysConfig);
          }
          break;

        case "activate":
          const token = params.get("token");
          if (!token) {
            setError("Missing activation token.");
            setStatus("error");
          } else {
            setActivationToken(token);
            fetchActivationInfo(token);
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

  const fetchActivationInfo = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/activation-info?token=${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid or expired activation token.");
      }
      const data = await res.json();
      setAppInfo(data);
      setStatus("activate");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const fetchSession = async (sid: string, currentMode: string, sysConfig: any) => {
    try {
      let endpointBase = `${BACKEND_URL}/api/auth/remote`;
      if (currentMode === "gov-vote") {
        endpointBase = `${BACKEND_URL}/api/governance/remote/vote`;
      } else if (currentMode === "gov-submit") {
        endpointBase = `${BACKEND_URL}/api/governance/remote/submit`;
      } else if (currentMode === "multisig") {
        endpointBase = `${BACKEND_URL}/api/governance/remote/confirm`;
      } else if (currentMode === "gov-execute") {
        endpointBase = `${BACKEND_URL}/api/governance/remote/execute`;
      }

      const res = await fetch(`${endpointBase}/status/${sid}`);
      if (!res.ok) throw new Error("Session not found or expired.");
      const data = await res.json();

      if (data.status === "expired") {
        setStatus("expired");
      } else if (data.status === "authorized") {
        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
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
        
        // Capture Governance Submission Metadata
        if (currentMode === "gov-submit" && data.proposal) {
          let ops: any[] = [];
          if (data.proposal.to === "MULTI_STEP") {
            try { ops = JSON.parse(data.proposal.data); } catch (e) { console.error("MULTI_STEP parse error", e); }
          }
          setGovernanceMetadata({
            ...data.proposal,
            multisigAddress: data.multisigAddress
          });
          if (ops.length > 0) setMultiStepOperations(ops);
          console.log("[AUTH] Governance submission metadata detected:", data.proposal);
        }

        // Capture Governance MultiSig Confirmation Metadata
        if (currentMode === "multisig" && data.txIndex !== undefined) {
          setGovernanceMetadata({
            txIndex: Number(data.txIndex),
            multisigAddress: sysConfig?.contracts?.multisig
          });
          console.log("[AUTH] Governance MultiSig Confirmation metadata detected:", data.txIndex);
        }

        // Capture Governance MultiSig Execution Metadata
        if (currentMode === "gov-execute" && data.txIndex !== undefined) {
          setGovernanceMetadata({
            txIndex: Number(data.txIndex),
            multisigAddress: sysConfig?.contracts?.multisig
          });
          console.log("[AUTH] Governance MultiSig Execution metadata detected:", data.txIndex);
        }

        // Capture Governance Voting Metadata
        if (currentMode === "gov-vote" && data.onChainTxIndex !== null && data.onChainTxIndex !== undefined) {
          setGovernanceMetadata({
            txIndex: Number(data.onChainTxIndex),
            multisigAddress: data.multisigAddress || sysConfig?.contracts?.multisig,
            decision: data.decision
          });
          console.log("[AUTH] Governance voting metadata detected:", data.onChainTxIndex, data.decision);
        }
        
        setStatus("ready");
      }
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  // 🛡️ [RESILIENCE] On-Chain Sync: Detect if notarization happened via other channel
  useEffect(() => {
    if (notarizeMetadata && config && status === "ready") {
      const checkOnChain = async () => {
        try {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const contract = new ethers.Contract(
            config.contracts.documentRegistry,
            ["function getDocument(bytes32) view returns (address, uint256, uint8, bool)"],
            provider
          );
          const docHash = notarizeMetadata.docHash;
          const onChain = await contract.getDocument(docHash);
          
          if (onChain[3]) { // exists == true
            console.log("✨ [SYNC] Document already on-chain. Auto-authorizing...");
            setStatus("authorized");
            setTimeout(() => window.close(), 10000);
          }
        } catch (e) {
          console.warn("[SYNC_ERR] Could not verify on-chain state:", e);
        }
      };
      checkOnChain();
    }
  }, [notarizeMetadata, config, status]);

  const ensureCorrectNetwork = async (provider: any) => {
    if (!config || !config.chainId) return;
    try {
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== Number(config.chainId)) {
        const targetChainHex = "0x" + Number(config.chainId).toString(16);
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainHex }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask.
          if (switchError.code === 4902) {
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: targetChainHex,
                    chainName: config.chainId === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain',
                    rpcUrls: [config.rpcUrl],
                    nativeCurrency: {
                      name: 'BNB',
                      symbol: 'BNB',
                      decimals: 18,
                    },
                    blockExplorerUrls: [config.chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com'],
                  },
                ],
              });
            } catch (addError) {
              console.error("Failed to add network:", addError);
            }
          } else {
            console.error("Failed to switch network:", switchError);
          }
        }
      }
    } catch (err) {
      console.warn("Network switch warning:", err);
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      setError("Web3 Wallet not found.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await ensureCorrectNetwork(provider);
      
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0];
      setWalletAddress(address);
      setIsConnected(true);
      setError(null);

      if (status === "genesis-check" || status === "activate") {
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
      }
    } catch (err: any) {
      setError("Failed to connect wallet.");
    }
  };

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  const handleNotaryActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationToken || !appInfo || !walletAddress) return;

    if (walletAddress.toLowerCase() !== appInfo.wallet.toLowerCase()) {
      setError(`Wallet mismatch. Please use: ${appInfo.wallet}`);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsActivating(true);
    setError(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      // 1. Fetch Nonce
      const nonceRes = await fetch(`${BACKEND_URL}/api/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: walletAddress, purpose: "NOTARY_ACTIVATE" })
      });
      if (!nonceRes.ok) throw new Error("Failed to fetch secure nonce.");
      const { nonce, message_template } = await nonceRes.json();

      // 2. Sign Message
      const signature = await signer.signMessage(message_template);

      // 3. Submit Activation
      const res = await fetch(`${BACKEND_URL}/api/auth/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: activationToken,
          password,
          signature,
          nonce
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Activation failed.");
      }

      setStatus("authorized");
      setTimeout(() => window.close(), 10000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsActivating(false);
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
      setTimeout(() => window.close(), 10000);
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
        if (challenge && challenge.includes('"domain"') && challenge.includes('"message"')) {
          parsedPayload = JSON.parse(challenge);
        }
      } catch (e) { /* Not a JSON payload */ }

      if (activeMode === "gov-vote" || activeMode === "gov-submit" || activeMode === "multisig" || activeMode === "gov-execute") {
        let authorizeEndpoint = `${BACKEND_URL}/api/governance/remote/vote/authorize`;
        
        // 🛡️ [Direct-Path] If this is a SUBMIT session and we have on-chain metadata, trigger direct transaction
        if (activeMode === "gov-submit" && governanceMetadata) {
           console.log("[AUTH] Initiating Direct MultiSig Submission...");
           try {
              const singularAbi = ["function submitTransaction(address[],uint256[],bytes[],bytes32) external"];
              const singularMultisig = new ethers.Contract(governanceMetadata.multisigAddress, singularAbi, signer);

              const propHash = governanceMetadata.proposalHash || "0x0000000000000000000000000000000000000000000000000000000000000000";
              let targets = [];
              let values = [];
              let datas = [];

              if (multiStepOperations.length > 0) {
                  targets = multiStepOperations.map(op => op.target);
                  values = multiStepOperations.map(op => BigInt(op.value || 0));
                  datas = multiStepOperations.map(op => op.data || "0x");
              } else {
                  targets = [governanceMetadata.to];
                  values = [BigInt(governanceMetadata.value || 0)];
                  let dataHex = governanceMetadata.data || "0x";
                  if (typeof dataHex === 'string' && dataHex.startsWith('[') && dataHex.endsWith(']')) {
                      try {
                          const parsed = JSON.parse(dataHex);
                          if (parsed.length > 0 && parsed[0].data) dataHex = parsed[0].data;
                      } catch(e) {}
                  }
                  datas = [dataHex];
              }

              const tx = await singularMultisig.submitTransaction(targets, values, datas, propHash);
              console.log("[AUTH] MultiSig Transaction Submitted:", tx.hash);
              await tx.wait();
              console.log("[AUTH] Transaction Confirmed!");

              const syncRes = await fetch(`${BACKEND_URL}/api/governance/remote/submit/sync-manual`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, txHash: tx.hash, walletAddress: address })
              });
              if (!syncRes.ok) throw new Error("Blockchain transaction succeeded, but backend sync failed.");
              setStatus("authorized");
              setTimeout(() => window.close(), 10000);
              return;
           } catch (err: any) {
              console.error("[AUTH_ERR] Direct submission failed:", err);
              throw new Error(err.reason || err.message || "On-chain submission failed. Ensure you have gas and the correct wallet.");
           }
        }

        // 🛡️ [Direct-Path] If this is a MULTISIG session and we have metadata, trigger direct transaction
         if (activeMode === "multisig" && governanceMetadata) {
            console.log("[AUTH] Initiating Direct MultiSig Confirmation...");
            try {
               const abi = [
                  "function confirmTransaction(uint256) external",
                  "function getTransaction(uint256) view returns (address, uint256, bytes, bool, uint256, uint256, uint256)"
               ];
               const multisig = new ethers.Contract(governanceMetadata.multisigAddress, abi, signer);
               
               // Self-healing State-Gap check: has this transaction already been executed on-chain?
               const txData = await multisig.getTransaction(governanceMetadata.txIndex);
               const alreadyExecuted = txData ? txData[3] : false;
               
               let txHashToSubmit = "";
               if (alreadyExecuted) {
                  console.log("[AUTH] Transaction has already been executed on-chain. Self-healing bypass triggered.");
                  txHashToSubmit = "already_executed_onchain";
               } else {
                  const tx = await multisig.confirmTransaction(governanceMetadata.txIndex);
                  console.log("[AUTH] MultiSig Confirmation Submitted:", tx.hash);
                  const receipt = await tx.wait();
                  console.log("[AUTH] Transaction Confirmed in block:", receipt.blockNumber);
                  txHashToSubmit = tx.hash;
               }
               
               // Step 2: Manual Sync with Backend
               const syncRes = await fetch(`${BACKEND_URL}/api/governance/remote/confirm/sync-manual`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ 
                   sessionId, 
                   txHash: txHashToSubmit,
                   walletAddress: address 
                 })
               });

               if (!syncRes.ok) {
                  const syncData = await syncRes.json().catch(() => ({}));
                  throw new Error(syncData.error || "Blockchain transaction succeeded, but backend sync failed.");
               }

               setStatus("authorized");
               setTimeout(() => window.close(), 10000);
               return;
            } catch (err: any) {
               console.error("[AUTH_ERR] Direct confirmation failed:", err);
               throw new Error(err.reason || err.message || "On-chain confirmation failed. Ensure you have gas and the correct wallet.");
            }
         }

        // 🛡️ [Direct-Path] If this is a GOV-EXECUTE session and we have metadata, trigger direct transaction
        if (activeMode === "gov-execute" && governanceMetadata) {
           console.log("[AUTH] Initiating Direct MultiSig Execution...");
           try {
              const abi = [
                 "function executeTransaction(uint256) external",
                 "function getTransaction(uint256) view returns (address, uint256, bytes, bool, uint256, uint256, uint256)"
              ];
              const multisig = new ethers.Contract(governanceMetadata.multisigAddress, abi, signer);
              
              // Self-healing State-Gap check: has this transaction already been executed on-chain?
              const txData = await multisig.getTransaction(governanceMetadata.txIndex);
              const alreadyExecuted = txData ? txData[3] : false;
              
              let txHashToSubmit = "";
              if (alreadyExecuted) {
                 console.log("[AUTH] Transaction has already been executed on-chain. Self-healing bypass triggered.");
                 txHashToSubmit = "already_executed_onchain";
              } else {
                 const tx = await multisig.executeTransaction(governanceMetadata.txIndex);
                 console.log("[AUTH] MultiSig Execution Submitted:", tx.hash);
                 const receipt = await tx.wait();
                 console.log("[AUTH] Transaction Confirmed in block:", receipt.blockNumber);
                 txHashToSubmit = tx.hash;
              }

              // Step 2: Manual Sync with Backend
              const syncRes = await fetch(`${BACKEND_URL}/api/governance/remote/execute/sync-manual`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  sessionId, 
                  txHash: txHashToSubmit,
                  walletAddress: address 
                })
              });

              if (!syncRes.ok) {
                 const syncData = await syncRes.json().catch(() => ({}));
                 throw new Error(syncData.error || "Blockchain transaction succeeded, but backend sync failed.");
              }

              setStatus("authorized");
              setTimeout(() => window.close(), 10000);
              return;
           } catch (err: any) {
              console.error("[AUTH_ERR] Direct execution failed:", err);
              throw new Error(err.reason || err.message || "On-chain execution failed. Ensure you have gas and the correct wallet.");
           }
        }

        // 🛡️ [Direct-Path] If this is a VOTE session and we have metadata, trigger direct transaction
        if (activeMode === "gov-vote" && governanceMetadata) {
           console.log("[AUTH] Initiating Direct On-Chain Vote...");
           try {
              const abi = [
                "function confirmTransaction(uint256) external",
                "function revokeConfirmation(uint256) external",
                "function isConfirmed(uint256,address) view returns (bool)"
              ];
              const multisig = new ethers.Contract(governanceMetadata.multisigAddress, abi, signer);
              
              // Self-healing State-Gap check: has this user already confirmed on-chain?
              const alreadyConfirmed = await multisig.isConfirmed(governanceMetadata.txIndex, address);
              console.log("[AUTH] On-chain confirmation status for this account:", alreadyConfirmed);

              let txHashToSubmit = "";
              
              if (governanceMetadata.decision === "approve") {
                 if (alreadyConfirmed) {
                    console.log("[AUTH] Account has already confirmed this transaction on-chain. Self-healing bypass triggered.");
                    txHashToSubmit = "already_confirmed_onchain";
                 } else {
                    console.log(`[AUTH] Calling confirmTransaction(${governanceMetadata.txIndex})`);
                    const tx = await multisig.confirmTransaction(governanceMetadata.txIndex);
                    console.log("[AUTH] Vote transaction submitted:", tx.hash);
                    const receipt = await tx.wait();
                    console.log("[AUTH] Transaction Confirmed in block:", receipt.blockNumber);
                    txHashToSubmit = tx.hash;
                 }
              } else {
                 if (!alreadyConfirmed) {
                    console.log("[AUTH] Account has already revoked / not confirmed this transaction on-chain. Self-healing bypass triggered.");
                    txHashToSubmit = "already_revoked_onchain";
                 } else {
                    console.log(`[AUTH] Calling revokeConfirmation(${governanceMetadata.txIndex})`);
                    const tx = await multisig.revokeConfirmation(governanceMetadata.txIndex);
                    console.log("[AUTH] Vote transaction submitted:", tx.hash);
                    const receipt = await tx.wait();
                    console.log("[AUTH] Transaction Confirmed in block:", receipt.blockNumber);
                    txHashToSubmit = tx.hash;
                 }
              }

              // Step 2: Authorize with Backend
              const syncRes = await fetch(`${BACKEND_URL}/api/governance/remote/vote/authorize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  sessionId, 
                  txHash: txHashToSubmit,
                  walletAddress: address 
                })
              });

              if (!syncRes.ok) {
                 const syncData = await syncRes.json().catch(() => ({}));
                 throw new Error(syncData.error || "Blockchain transaction succeeded, but backend sync failed.");
              }

              setStatus("authorized");
              setTimeout(() => window.close(), 10000);
              return;
           } catch (err: any) {
              console.error("[AUTH_ERR] Direct voting failed:", err);
              throw new Error(err.reason || err.message || "On-chain voting failed. Ensure you have gas and the correct wallet.");
           }
        }

        if (activeMode === "gov-submit") authorizeEndpoint = `${BACKEND_URL}/api/governance/remote/submit/authorize`;
        else if (activeMode === "multisig") authorizeEndpoint = `${BACKEND_URL}/api/governance/remote/confirm/authorize`;

        let signature;
        if (parsedPayload) {
          signature = await signer.signTypedData(
            parsedPayload.domain,
            parsedPayload.types,
            parsedPayload.message
          );
        } else {
          signature = await signer.signMessage(challenge!);
        }

        const res = await fetch(authorizeEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress: address, signature })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Governance Authorization failed on server");
        }

        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
        return;
      }

      if (notarizeMetadata && !isDirect) {
        // 🛡️ [Step B] Notarize-Mode EIP-712 Signing (GASLESS)
        console.log(`[AUTH] Initiating Gasless Notarization Signing for doc: ${notarizeMetadata.message?.docHash || notarizeMetadata.docHash}`);
        
        const payloadMessage = notarizeMetadata.message || notarizeMetadata;

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
          ...payloadMessage,
          status: Number(payloadMessage.status),
          timestamp: Number(payloadMessage.timestamp),
          nonce: BigInt(payloadMessage.nonce).toString()
        };

        console.log("[AUTH] Signing Notarize Payload (Gasless):", { domain, types, message });
        
        const signature = await signer.signTypedData(domain, types, message);
        console.log("[AUTH] Notarization signature obtained. Relaying to authority via atomic-bind...");

        const bindRes = await fetch(`${BACKEND_URL}/api/auth/remote/atomic-bind`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            signature,
            walletAddress: address,
            timestamp: payloadMessage.timestamp.toString()
          })
        });

        if (!bindRes.ok) {
          const data = await bindRes.json().catch(() => ({}));
          throw new Error(data.error || "Notarization Relay Failed");
        }

        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
      } else if (parsedPayload && isDirect) {
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
          body: JSON.stringify({ sessionId, walletAddress: address, signature: `DIRECT_TX_CONFIRMED:${tx.hash}` })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to notify backend of transaction");
        }
        
        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
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

        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
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

        const bindRes = await fetch(`${BACKEND_URL}/auth/remote/atomic-bind`, {
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
        setTimeout(() => window.close(), 10000);
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
        setTimeout(() => window.close(), 10000);
      }
    } catch (err: any) {
      setError(err.reason || err.message);
      setStatus("error");
    }
  };



  const handlePromote = async () => {
    if (!isConnected || !walletAddress || !targetAddress) return;
    setIsPromoting(true);
    setError(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await ensureCorrectNetwork(provider);
      
      const signer = await provider.getSigner();
      
      const abi = [
        "function getUserRole(address) view returns (uint8)",
        "function assignOwner(address) external",
        "function promoteToNotary(address) external"
      ];
      const contract = new ethers.Contract(config.contracts.notaryRegistry, abi, signer);
      
      console.log(`[PROMOTE] Checking current role for: ${targetAddress}`);
      const currentRole = Number(await contract.getUserRole(targetAddress));
      
      if (currentRole >= 2) { // Already Notary (2) or Admin (3)
        console.log(`[PROMOTE] ✅ User already promoted on-chain (Role: ${currentRole}). Finishing.`);
        setStatus("authorized");
        setTimeout(() => window.close(), 10000);
        return;
      }

      // Step 2: Direct promotion (NONE -> NOTARY or OWNER -> NOTARY)
      console.log(`[PROMOTE] Step 2: Initiating on-chain promotion for: ${targetAddress}`);
      const tx2 = await contract.promoteToNotary(targetAddress);
      
      console.log(`[PROMOTE] Transaction submitted: ${tx2.hash}`);
      await tx2.wait();



      
      console.log(`[PROMOTE] Success! Finalizing session...`);
      setStatus("authorized");
      setTimeout(() => window.close(), 10000);
    } catch (err: any) {
      console.error("[PROMOTE_FAIL]", err);
      setError(err.reason || err.message || "On-chain promotion failed. Please ensure you have ADMIN role and enough BNB for gas.");
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
        <Shield size={64} className="icon-pulse" color={status === "error" ? "var(--error)" : "var(--primary)"} />
      </div>

      <h1>BBSNS {status.startsWith("genesis") || status === "onboarding" ? "Initialization" : status === "promote" ? "Governance Action" : activeMode?.startsWith("gov") || activeMode === "multisig" ? "Governance Authorization" : "Remote Auth"}</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        {status === "onboarding" ? "Setting up Genesis Admin Identity" : status === "promote" ? "Elevate account to Notary Status" : activeMode?.startsWith("gov") || activeMode === "multisig" ? "Securely signing a governance transaction" : "Secure Handshake for Protocol Operations"}
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



      {status === "promote" && (
        <div className="view-container">
          <div className="alert alert-info">
            <strong>Notary Promotion Authority</strong><br/>
            You are about to elevate the following wallet to the <strong>Notary</strong> role on the BNB Testnet.
          </div>
          
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', textAlign: 'left' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Wallet size={20} color="var(--primary)" />
                <span style={{ fontWeight: '600' }}>Target Notary Wallet</span>
             </div>
             <code style={{ fontSize: '0.85rem', wordBreak: 'break-all', display: 'block', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', color: 'var(--primary)' }}>
                {targetAddress}
             </code>
          </div>

          {!isConnected ? (
            <button className="button" onClick={connectWallet}>
              <Wallet size={18} style={{ marginRight: "10px" }} />
              Connect Admin Wallet
            </button>
          ) : (
            <>
              <div className="address-chip" style={{ marginBottom: "1rem" }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginRight: '8px' }}>ADMIN:</span>
                {walletAddress}
              </div>
              <button className="button" onClick={handlePromote} disabled={isPromoting}>
                {isPromoting ? <Loader2 className="animate-spin" /> : <Shield size={18} style={{ marginRight: "10px" }} />}
                Confirm On-Chain Promotion
              </button>
            </>
          )}
        </div>
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
                  <span style={{ color: "var(--muted)", display: "block" }}>File Hash</span>
                  <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{notarizeMetadata.docHash}</code>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Owner</span>
                  <code style={{ fontSize: '0.7rem' }}>{notarizeMetadata.ownerAddress}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ color: "var(--muted)" }}>Action</span>
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

          {governanceMetadata && (
            <div className="bg-muted/50 rounded-xl p-4 mb-4" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                <Shield size={18} color="var(--primary)" />
                <span style={{ fontWeight: '600', color: 'var(--primary)' }}>
                  {activeMode === "gov-submit" ? "Submit Proposal" : activeMode === "multisig" ? "Confirm Multi-Sig Tx" : activeMode === "gov-execute" ? "Execute Multi-Sig Tx" : "Vote on Multi-Sig Tx"}
                </span>
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.8rem' }}>
                {governanceMetadata.txIndex !== undefined && (
                  <div>
                    <span style={{ color: "var(--muted)", display: "block" }}>Transaction Index</span>
                    <code style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>#{governanceMetadata.txIndex}</code>
                  </div>
                )}
                {governanceMetadata.to && (
                  <div>
                    <span style={{ color: "var(--muted)", display: "block" }}>Target Contract</span>
                    <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{governanceMetadata.to}</code>
                  </div>
                )}
                {governanceMetadata.decision && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ color: "var(--muted)" }}>Vote Decision</span>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      fontSize: '0.7rem',
                      background: governanceMetadata.decision === 'approve' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: governanceMetadata.decision === 'approve' ? '#10b981' : '#ef4444',
                      border: governanceMetadata.decision === 'approve' ? '1px solid #10b98133' : '1px solid #ef444433'
                    }}>
                      {governanceMetadata.decision.toUpperCase()}
                    </span>
                  </div>
                )}
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
              {activeMode === "gov-execute" ? (
                <button className="button" onClick={() => handleAuthorize(true)}>
                  <Shield size={18} style={{ marginRight: "10px" }} />
                  Execute Transaction (Direct MetaMask)
                </button>
              ) : activeMode === "multisig" || activeMode === "gov-vote" ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                  <button className="button" style={{ width: '100%' }} onClick={() => handleAuthorize(true)}>
                    <Wallet size={18} style={{ marginRight: "10px" }} />
                    Submit Direct Transaction (Pay Gas)
                  </button>
                </div>
              ) : activeMode === "gov-submit" && multiStepOperations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                  <div className="alert alert-warning" style={{ fontSize: "0.75rem", padding: "0.5rem" }}>
                    <ShieldAlert size={14} style={{ marginRight: "4px", display: "inline" }} />
                    <strong>DO NOT CLOSE THIS WINDOW.</strong> This action requires two sequential signatures to grant full authority.
                  </div>
                  <button className="button" style={{ width: '100%' }} onClick={() => handleAuthorize(true)}>
                    <Wallet size={18} style={{ marginRight: "10px" }} />
                    {multiStepIndex === 0 ? "Promote Admin Role (Step 1/2)" : "Add Governance Signer (Step 2/2)"}
                  </button>
                </div>
              ) : challenge?.includes('"domain"') ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                  <button className="button" style={{ width: '100%' }} onClick={() => handleAuthorize(true)}>
                    <Wallet size={18} style={{ marginRight: "10px" }} />
                    Approve & Pay Gas (Direct)
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

      {status === "cooldown" && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <div className="status-spinner" />
          <div style={{ color: "var(--primary)", fontWeight: "600", marginTop: "1rem" }}>
            <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>{"[=======>  ]"}</span> Processing Finality...
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Please do not close this window. Preparing step 2/2.</span>
        </div>
      )}

      {status === "authorized" && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <CheckCircle2 size={64} color="var(--primary)" style={{ margin: "0 auto 1.5rem" }} />
          <h2 style={{ color: "var(--primary)", marginBottom: "0.5rem" }}>Operation Successful!</h2>
          <p style={{ color: "var(--muted)" }}>You can now return to the desktop app.</p>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontStyle: "italic" }}>Closing in 10 seconds...</span>
        </div>
      )}

      {status === "activate" && (
        <div className="view-container">
          {!isConnected ? (
            <div className="onboarding-form">
              <div className="alert alert-info">
                <strong>Professional Identity Found</strong><br/>
                Welcome, {appInfo?.name}. Please connect the wallet authorized for your notary account.
              </div>
              <div className="address-chip" style={{ marginBottom: "1rem" }}>{appInfo?.wallet}</div>
              <button className="button" onClick={connectWallet}>
                <Wallet size={18} style={{ marginRight: "10px" }} />
                Connect Authorized Wallet
              </button>
            </div>
          ) : (
            <form onSubmit={handleNotaryActivate} className="onboarding-form">
              <div className="alert alert-info">
                <strong>Wallet Verified</strong><br/>
                Set your secure password to complete activation.
              </div>
              <div className="address-chip" style={{ marginBottom: "1rem" }}>{walletAddress}</div>
              
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required />
              </div>

              <button type="submit" className="button" disabled={isActivating} style={{ marginTop: "1rem" }}>
                {isActivating ? <Loader2 className="animate-spin" /> : <Shield size={18} style={{ marginRight: "10px" }} />}
                Finalize Activation
              </button>
            </form>
          )}
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
