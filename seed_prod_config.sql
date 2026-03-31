-- BBSNS PRODUCTION CONFIGURATION SEED (SET 1)
UPDATE system_config 
SET config_snapshot = '{
  "rpcUrl": "https://data-seed-prebsc-1-s1.binance.org:8545",
  "chainId": 97,
  "apiBaseUrl": "http://13.203.121.127:5000",
  "webAppUrl": "http://13.203.121.127:3000",
  "contracts": {
    "notaryRegistry": "0x1A820f5975dc41c904bF221df342191694Da1f98",
    "documentRegistry": "0x8fdaCefB6002F56A59cef36dA94e2ee9d55D7fe6",
    "ntkr": "0xD59a331bC1e2439b686d75cffBdDE419a51eeFCE",
    "ntk": "0x0d92A3De88202C929714df9cB24395CF4C15ba2e",
    "genesisActivation": "0x11DAA2d0ffCCE08B138BB345e3CdBc7d7483686d",
    "genesisNft": "0x66a309BFeEeC137411d2B0BaA890c79b864F8886",
    "multisig": "0xED1873d82766D61D3A5564A62b71C6DCc1403366"
  }
}',
version = 1,
updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
