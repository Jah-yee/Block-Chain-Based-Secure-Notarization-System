export type ApiError = {
    error: string;
    message?: string;
    code?: string;
};

const ERROR_MAP: Record<string, string> = {
    "Invalid credentials": "Incorrect email or password. Please double-check your entry or reset your password.",
    "Account verification failed": "The National ID provided does not match our records for this account.",
    "Wallet mismatch": "The connected wallet doesn't match this account. Please switch to the correct address in MetaMask.",
    "Registration failed. This email is already in use": "An account with this email already exists. Try signing in instead.",
    "Registration failed. This wallet is already linked": "This wallet is already associated with another account.",
    "System Busy": "The server is currently experiencing high load. Please try again in 1-2 minutes.",
    "Invalid signature": "The security signature check failed. Please ensure your wallet is active and try again.",
    "Login Protection Active": "Too many login attempts. Please wait 15 minutes for your security.",
};

export async function handleApiResponse(response: Response) {
    if (response.ok) {
        return await response.json();
    }

    let errorMsg = "Something went wrong on our side. Please try again in a few minutes.";

    try {
        const data: ApiError = await response.json();
        if (data.error) {
            // Find a friendly mapping if it exists
            const match = Object.keys(ERROR_MAP).find(key => data.error.includes(key));
            errorMsg = match ? ERROR_MAP[match] : data.error;
        }
    } catch (e) {
        // If we can't parse JSON, the server likely crashed or timed out
        console.error("[API] Failed to parse error response", e);
    }

    throw new Error(errorMsg);
}

export function getFriendlyError(err: any): string {
    if (err instanceof Error) return err.message;
    return "An unexpected error occurred. Please refresh the page.";
}
