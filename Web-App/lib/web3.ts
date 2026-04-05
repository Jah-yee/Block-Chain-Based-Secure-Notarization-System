import { ethers } from "ethers";

// EIP-712 Domain for DocumentRegistry
const DOMAIN_NAME = "BBSNS_Protocol";
const DOMAIN_VERSION = "2"; // Professional Upgrade Version

/**
 * Gets the EIP-712 Domain for the Registry
 */
export async function getRegistryDomain(chainId: number, registryAddress: string) {
    return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: chainId,
        verifyingContract: registryAddress,
    };
}

/**
 * Types for Notarize Action
 */
export const NOTARIZE_TYPES = {
    Notarize: [
        { name: "docHash", type: "bytes32" },
        { name: "status", type: "uint8" },
        { name: "timestamp", type: "uint256" },
    ],
};

/**
 * Types for Multi-Sig Confirmation
 */
export const CONFIRM_TYPES = {
    Confirm: [
        { name: "txIndex", type: "uint256" },
        { name: "version", type: "uint256" },
    ],
};

/**
 * Types for Multi-Sig Submission
 */
export const SUBMIT_TYPES = {
    Submit: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "version", type: "uint256" },
    ],
};

/**
 * Signs a notarization action using EIP-712
 */
export async function signNotarizeAction(
    signer: ethers.Signer,
    chainId: number,
    registryAddress: string,
    docHash: string,
    status: number,
    timestamp: number
) {
    const domain = await getRegistryDomain(chainId, registryAddress);
    const value = {
        docHash,
        status,
        timestamp,
    };

    return await signer.signTypedData(domain, NOTARIZE_TYPES, value);
}

/**
 * Signs a Multi-Sig confirmation using EIP-712
 */
export async function signConfirmAction(
    signer: ethers.Signer,
    chainId: number,
    multiSigAddress: string,
    txIndex: number,
    version: number
) {
    const domain = {
        name: "BBSNS_Protocol",
        version: "2",
        chainId,
        verifyingContract: multiSigAddress
    };

    const value = {
        txIndex,
        version
    };

    return await signer.signTypedData(domain, CONFIRM_TYPES, value);
}

/**
 * Signs a Multi-Sig submission action using EIP-712
 */
export async function signSubmitAction(
    signer: ethers.Signer,
    chainId: number,
    multiSigAddress: string,
    to: string,
    value: string, // uint256 as string
    data: string,  // hex data
    version: number
) {
    const domain = {
        name: "BBSNS_Protocol",
        version: "2",
        chainId,
        verifyingContract: multiSigAddress
    };

    const valueData = {
        to,
        value,
        data,
        version
    };

    return await signer.signTypedData(domain, SUBMIT_TYPES, valueData);
}

/**
 * Connects to the user's wallet
 */
export async function connectWallet() {
    if (!window.ethereum) {
        throw new Error("No crypto wallet found. Please install MetaMask.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();

    return {
        provider,
        signer,
        address: accounts[0],
        chainId: Number(network.chainId)
    };
}
