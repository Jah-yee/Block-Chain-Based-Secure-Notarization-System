import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const PINATA_JWT = process.env.PINATA_JWT;
        if (!PINATA_JWT) {
            return NextResponse.json({ error: 'Pinata JWT not configured on server' }, { status: 500 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // 1. Prepare Pinata Request
        const pinataData = new FormData();
        pinataData.append('file', file);

        // Optional: Add metadata to Pinata (e.g. filename)
        const metadata = JSON.stringify({
            name: `BBSNS_ENCRYPTED_${file.name}`,
        });
        pinataData.append('pinataMetadata', metadata);

        const pinataOptions = JSON.stringify({
            cidVersion: 1,
        });
        pinataData.append('pinataOptions', pinataOptions);

        // 2. Upload to Pinata
        const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${PINATA_JWT}`,
            },
            body: pinataData,
        });

        if (!res.ok) {
            const error = await res.json();
            console.error('Pinata Upload Error:', error);
            return NextResponse.json({ error: 'Failed to upload to IPFS' }, { status: 502 });
        }

        const data = await res.json();

        // Return the CID (IpfsHash)
        return NextResponse.json({ ipfs_cid: data.IpfsHash });

    } catch (err: any) {
        console.error('IPFS Proxy Error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
