#!/bin/bash
curl -s -X POST http://localhost:5000/api/auth/nonce -H "Content-Type: application/json" -d '{"wallet_address":"0x1234567890123456789012345678901234567890"}'
echo ""
