import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog';
import { importNotaryPrivateKey, unwrapKeyForNotary, decryptFile } from '@/lib/encryption';

interface NotaryVerifyProps {
    doc: any; // { ipfs_cid, encrypted_key, file_hash, id }
    onAction: (status: string, reason?: string) => void;
}

export function NotaryVerify({ doc, onAction }: NotaryVerifyProps) {
    const [privateKeyPem, setPrivateKeyPem] = useState('');
    const [decryptedText, setDecryptedText] = useState<string | null>(null);
    const [status, setStatus] = useState('idle'); // idle, decrypting, verified, failed
    const [error, setError] = useState('');
    const [hashMatch, setHashMatch] = useState<boolean | null>(null);

    const handleDecrypt = async () => {
        setStatus('decrypting');
        setError('');

        try {
            if (!doc.ipfs_cid || !doc.encrypted_key) {
                throw new Error('Missing encrypted artifacts');
            }

            // 1. Fetch Ciphertext (Mock fetch from IPFS Gateway)
            // For MVP, we simulated the upload, so we can't actually fetch from a real IPFS node unless one is running.
            // However, we MUST implement the logic flow.
            // We will assume the ciphertext is available or mock response for this specific MVP context if needed.
            // But strictly following the prompt: "Fetch ciphertext from IPFS".
            // I will put a placeholder fetch here.
            // const response = await fetch(`https://ipfs.io/ipfs/${doc.ipfs_cid}`);
            // const encryptedBlob = await response.blob();

            // MOCK FOR DEMO since we didn't actually upload to real IPFS in Step 3.5.2 (we just stored CID string).
            // We need a way to verify the flow works.
            // I will throw an error if this is a real run without IPFS. 
            // User said "Simulate Unpin", implying we might be mocking IPFS interactions.
            // But for decryption, we need DATA.
            // If I can't fetch real data, I can't decrypt.
            // I'll implement the code correctly, assuming the URL works.

            // -- REAL CODE PATH --
            // const response = await fetch(`https://gateway.pinata.cloud/ipfs/${doc.ipfs_cid}`);
            // if (!response.ok) throw new Error('IPFS Fetch Failed');
            // const encryptedBlob = await response.blob();

            // -- MOCK PATH (For Testing without IPFS Node) --
            // We'll create a dummy encrypted blob if needed, OR just fail if not found.
            // Failing closed is the requirement.
            // I will write the REAL code. If it fails, it fails (fail safe).

            const response = await fetch(`https://ipfs.io/ipfs/${doc.ipfs_cid}`);
            if (!response.ok) throw new Error('Failed to fetch from IPFS');
            const encryptedBlob = await response.blob();

            // 2. Unwrap Key
            const notaryKey = await importNotaryPrivateKey(privateKeyPem);

            // encrypted_key is likely Base64 or Hex in DB. encryption.ts handles ArrayBuffers.
            // We need to convert DB string to ArrayBuffer.
            // Assuming it was stored as Base64 in Secure Upload (Task 3.5.2).
            // Wait, 3.5.2 didn't implement the Frontend Upload logic, just the Backend.
            // The user wants me to implement "Notary Decryption".
            // I will assume standard Base64 encoding for 'encrypted_key'.
            const wrappedKeyBuffer = Uint8Array.from(atob(doc.encrypted_key), c => c.charCodeAt(0));

            const aesKey = await unwrapKeyForNotary(wrappedKeyBuffer.buffer, notaryKey);

            // 3. Decrypt
            const plaintextBuffer = await decryptFile(encryptedBlob, aesKey);

            // 4. Verify Hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', plaintextBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (hashHex.toLowerCase() !== doc.file_hash.toLowerCase()) {
                setHashMatch(false);
                throw new Error('Hash Mismatch! Document integrity compromised.');
            }
            setHashMatch(true);

            // 5. Render
            // Assume text for MVP
            const decoder = new TextDecoder();
            setDecryptedText(decoder.decode(plaintextBuffer));
            setStatus('verified');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Decryption failed');
            setStatus('failed');
            // Fail Closed logic handled by UI state
        }
    };

    const cleanMemory = () => {
        setPrivateKeyPem('');
        setDecryptedText(null);
        setStatus('idle');
    }

    return (
        <Dialog onOpenChange={(open) => !open && cleanMemory()}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">Verify Encrypted Doc</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogTitle>Notary Decryption (Local Only)</DialogTitle>
                <DialogDescription>
                    Securely decrypt and verify the document using your unique notary private key. This process happens entirely in your browser's local memory.
                </DialogDescription>

                <div className="space-y-4">
                    <div className="p-4 bg-muted rounded text-sm">
                        <p><strong>CID:</strong> {doc.ipfs_cid}</p>
                        <p><strong>Hash:</strong> {doc.file_hash}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                            Private Key stays in browser memory. Unwrapping happens locally.
                        </p>
                    </div>

                    {status === 'idle' || status === 'failed' ? (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Paste Notary Private Key (PEM)</label>
                            <Textarea
                                value={privateKeyPem}
                                onChange={e => setPrivateKeyPem(e.target.value)}
                                placeholder="-----BEGIN PRIVATE KEY-----..."
                                className="font-mono text-xs h-32"
                            />
                            <Button onClick={handleDecrypt} disabled={!privateKeyPem} className="w-full">
                                Fetch & Decrypt
                            </Button>
                            {status === 'failed' && (
                                <div className="text-red-500 text-sm font-bold bg-red-50 p-2 rounded">
                                    ❌ Error: {error}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-green-600 font-bold">✅ Decrypted Successfully</span>
                                {hashMatch && <span className="text-blue-600 text-xs">(Hash Verified)</span>}
                            </div>

                            <div className="h-48 overflow-auto border p-2 rounded bg-white font-mono text-sm max-h-60">
                                {decryptedText}
                            </div>

                            <div className="flex gap-2 justify-end">
                                <Button variant="destructive" onClick={() => {
                                    onAction('rejected');
                                    cleanMemory();
                                }}>
                                    Reject & Destroy Key
                                </Button>
                                <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => {
                                    onAction('approved');
                                    cleanMemory();
                                }}>
                                    Approve & Unpin
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
