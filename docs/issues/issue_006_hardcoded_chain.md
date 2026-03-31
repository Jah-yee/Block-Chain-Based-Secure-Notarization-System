# ISSUE-006: Hardcoded Blockchain Environment (ChainID 97)

## Description
The codebase contains multiple hardcoded references to BSC Testnet (ChainID 97) in validation logic, specifically in `ConfigService`.

## Impact
- **Architecture Low**: Significant refactoring will be required to move the system to BNB Mainnet or other EVM chains.

## Proposed Resolution
- Move all ChainID validation to use the `process.env.CHAIN_ID` variable exclusively.
- Remove hardcoded `97` checks in `config.service.js`.
