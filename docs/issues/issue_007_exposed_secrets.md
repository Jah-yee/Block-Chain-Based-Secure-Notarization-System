# ISSUE-007: Exposed System Secrets in .env

## Description
High-entropy secrets like `BNB_SYSTEM_PRIVATE_KEY` and `JWT_SECRET` are stored as plaintext in the `.env` file and are currently used directly by the application.

## Impact
- **Security High**: If the `.env` file is leaked or the server is compromised, the entire blockchain authorization system (Relayer) is compromised.

## Proposed Resolution
- Support loading secrets from an environment variable set by the OS (System Environment) or a Secret Management service (AWS Secrets Manager).
- Implement a `SecretProvider` service to abstract secret retrieval.
