# ISSUE-004: Missing EIP-712 Signature Verification

## Description
In `backend/src/routes/notaries.js`, the `/applications/:id/verify` endpoint receives a wallet signature but does not verify it against the applicant's wallet address.

```javascript
// Line 113: In a real system, we would verify the EIP-712 signature here
// For now, we update the application with the liveness result and signature
```

## Impact
- **Security High**: An attacker can submit a spoofed "Liveness Success" Result with an arbitrary signature to bypass identity verification.

## Proposed Resolution
- Implement `ethers.verifyMessage` or `ethers.verifyTypedData` (EIP-712) in the route handler.
- Verify that the recovered address matches the `wallet_address` stored in the application.
