"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface UserProfile {
    id: string
    username: string
    name: string
    email: string
    wallet_address: string
    role: 'admin' | 'user' | 'notary'
    liveness_status: string
    kyc_verified: boolean
}

interface UserBalances {
    wallet: string
    ntk: string
    ntkr: string
    bnb: string
}

interface LiveBalances {
    bnb: string | null
    ntkr: string | null
    ntk: string | null
    isLive: boolean
    chainId: number | null
}

interface WalletContextType {
    user: UserProfile | null
    balances: UserBalances | null
    connectedAccount: string | null
    chainId: number | null
    isLoading: boolean
    error: string | null
    liveBalances: LiveBalances
    isRestricted: boolean
    restrictionDetail: string | null
    refreshBalances: () => Promise<void>
    connectWallet: () => Promise<void>
    logout: () => void
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

import { apiClient } from "@/lib/api-client"
import { useConfig } from "@/providers/ConfigProvider"

export function WalletProvider({ children }: { children: ReactNode }) {
    const { config } = useConfig();
    const [user, setUser] = useState<UserProfile | null>(null)
    const [balances, setBalances] = useState<UserBalances | null>(null)
    const [connectedAccount, setConnectedAccount] = useState<string | null>(null)
    const [chainId, setChainId] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isRestricted, setIsRestricted] = useState(false)
    const [restrictionDetail, setRestrictionDetail] = useState<string | null>(null)

    // Live balances state (initialized from cached balances)
    const [liveBalances, setLiveBalances] = useState<LiveBalances>({
        bnb: null,
        ntkr: null,
        ntk: null,
        isLive: false,
        chainId: null
    })

    const refreshBalances = async () => {
        try {
            // 1. Fetch cached balances from backend
            const data = await apiClient.get('/api/tokens/balance');
            setBalances(data);
            
            // Clear any previous restrictions on successful fetch
            setIsRestricted(false);
            setRestrictionDetail(null);

            // 2. Fetch truly LIVE balances from MetaMask if connected
            if (typeof window !== "undefined" && window.ethereum && connectedAccount) {
                const { ethers } = await import("ethers");
                const provider = new ethers.BrowserProvider(window.ethereum);
                const bnbBal = await provider.getBalance(connectedAccount);

                let ntkrBal = "0";
                let ntkBal = "0";
                const ntkrAddr = config?.contracts.ntkr;
                const ntkAddr = config?.contracts.ntk;
                const abi = ["function balanceOf(address) view returns (uint256)"];

                if (ntkrAddr) {
                    const ntkrContract = new ethers.Contract(ntkrAddr, abi, provider);
                    const bal = await ntkrContract.balanceOf(connectedAccount);
                    ntkrBal = ethers.formatUnits(bal, 18);
                }

                if (ntkAddr) {
                    const ntkContract = new ethers.Contract(ntkAddr, abi, provider);
                    const bal = await ntkContract.balanceOf(connectedAccount);
                    ntkBal = ethers.formatUnits(bal, 18);
                }

                // Update live state immediately
                setLiveBalances({
                    bnb: ethers.formatEther(bnbBal),
                    ntkr: ntkrBal,
                    ntk: ntkBal,
                    isLive: true,
                    chainId: Number((await provider.getNetwork()).chainId)
                });
                console.log("[WALLET] Live Balances updated:", ntkrBal, "NTKR");
            }
        } catch (err: any) {
            console.error("Balance refresh failed:", err);
            // Handle Authorization vs Authentication
            if (err.status === 403) {
                setIsRestricted(true);
                setRestrictionDetail(err.detail || err.message);
                // We DON'T clear user state here. We stay logged in but restricted.
            } else if (err.status === 401) {
                // Should be handled by global interceptor, but fallback:
                setUser(null);
            }
        }
    }

    const fetchProfile = async () => {
        try {
            const data = await apiClient.get('/auth/me');
            if (data && data.user) {
                setUser(data.user);
                await refreshBalances();
            } else {
                setUser(null);
            }
        } catch (err: any) {
            // Silently handle auth errors to reduce console noise
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }

    const logout = async () => {
        try {
            await apiClient.post('/auth/logout');
        } catch (e) {
            console.warn("Logout request failed, clearing local state anyway");
        }

        // Task: Fix logout race condition
        // Clear tokens first
        localStorage.removeItem('bbsns_token');
        localStorage.removeItem('connectedWallet');

        // Hard redirect to home to prevent React re-renders on the protected page
        // which cause "Access Denied" or "Layout Crash" flashes.
        window.location.href = "/";
    }

    useEffect(() => {
        // Define public routes that don't require authentication
        const publicRoutes = ['/', '/login', '/signup', '/register-notary', '/governance/remote-sign'];
        const isPublicRoute = publicRoutes.some(route =>
            window.location.pathname === route || window.location.pathname.startsWith(route + '/')
        );

        // Fetch profile on all routes to see if session exists
        fetchProfile();

        const handleUnauthorized = () => {
            setUser(null);
            setBalances(null);
            // Only redirect if on a protected route
            if (!isPublicRoute && window.location.pathname !== '/login') {
                window.location.href = "/login";
            }
        };

        window.addEventListener('bbs_unauthorized', handleUnauthorized);
        return () => window.removeEventListener('bbs_unauthorized', handleUnauthorized);
    }, [])

    const fetchWalletInfo = React.useCallback(async () => {
        // Double check provider existence
        if (typeof window === "undefined") return;

        // If Ethereum provider is not ready, don't crash, just return
        if (!window.ethereum) {
            console.log("[WALLET] Ethereum provider not found");
            return;
        }

        try {
            const { ethers } = await import("ethers");
            // Wrap provider creation in try-catch as it can fail if extension is dead
            let provider;
            try {
                provider = new ethers.BrowserProvider(window.ethereum);
            } catch (e) {
                console.warn("Failed to create BrowserProvider", e);
                return;
            }

            const network = await provider.getNetwork();
            const currentChainId = Number(network.chainId);
            setChainId(currentChainId);

            const accounts = await provider.send("eth_accounts", []);

            if (accounts.length === 0) {
                setConnectedAccount(null);
                setLiveBalances(prev => ({ ...prev, isLive: false, chainId: currentChainId }));
                return;
            }

            const account = accounts[0];
            setConnectedAccount(account);
            setLiveBalances(prev => ({ ...prev, isLive: true, chainId: currentChainId }));

            // Trigger balance refresh for the new account
            try {
                const bnbBal = await provider.getBalance(account);

                // Fetch Token Balances Live
                let ntkrBal = "0";
                let ntkBal = "0";
                const ntkrAddr = config?.contracts.ntkr;
                const ntkAddr = config?.contracts.ntk;
                const abi = ["function balanceOf(address) view returns (uint256)"];

                if (ntkrAddr) {
                    try {
                        const ntkrContract = new ethers.Contract(ntkrAddr, abi, provider);
                        const bal = await ntkrContract.balanceOf(account);
                        ntkrBal = ethers.formatUnits(bal, 18);
                    } catch (e) {
                        console.warn("Failed to fetch NTKR balance", e);
                    }
                }

                if (ntkAddr) {
                    try {
                        const ntkContract = new ethers.Contract(ntkAddr, abi, provider);
                        const bal = await ntkContract.balanceOf(account);
                        ntkBal = ethers.formatUnits(bal, 18);
                    } catch (e) {
                        console.warn("Failed to fetch NTK balance", e);
                    }
                }

                setLiveBalances({
                    bnb: ethers.formatEther(bnbBal),
                    ntkr: ntkrBal,
                    ntk: ntkBal,
                    isLive: true,
                    chainId: currentChainId
                });
            } catch (err) {
                console.warn("Error fetching balances:", err);
            }
        } catch (err) {
            console.error("Failed to fetch wallet info", err);
        }
    }, []); // Empty dependency array - this function should be stable

    const connectWallet = async () => {
        if (typeof window !== "undefined" && window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                await fetchWalletInfo();
            } catch (err: any) {
                console.error("Connection error", err);
            }
        }
    }

    // Task B.5: Guarded listeners and robust cleanup
    useEffect(() => {
        if (typeof window === "undefined" || !window.ethereum) return;

        fetchWalletInfo();

        const handleChainChanged = () => window.location.reload();
        const handleAccountsChanged = () => fetchWalletInfo();

        const provider = window.ethereum;
        try {
            provider.on('accountsChanged', handleAccountsChanged);
            provider.on('chainChanged', handleChainChanged);
        } catch (e) {
            console.warn("Failed to attach Ethereum listeners", e);
        }

        return () => {
            try {
                if (provider?.removeListener) {
                    provider.removeListener('accountsChanged', handleAccountsChanged);
                    provider.removeListener('chainChanged', handleChainChanged);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }, [user, fetchWalletInfo])

    return (
        <WalletContext.Provider value={{
            user,
            balances,
            connectedAccount,
            chainId,
            isLoading,
            error,
            liveBalances,
            isRestricted,
            restrictionDetail,
            refreshBalances,
            connectWallet,
            logout
        }}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWalletSession() {
    const context = useContext(WalletContext)
    if (context === undefined) {
        throw new Error("useWalletSession must be used within a WalletProvider")
    }
    return context
}
