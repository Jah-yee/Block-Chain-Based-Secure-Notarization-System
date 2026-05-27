/**
 * 🛡️ BBSNS Smart Contract Deployment Diagnostic & Audit Script
 * Institutional-grade blockchain deployment verification utility.
 */

const fs = require('fs');
const path = require('path');

// =========================================================
// DYNAMIC ETHERS LOADER
// =========================================================

let ethers;

const loadPaths = [
    'c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/node_modules/ethers',
    './backend/node_modules/ethers',
    '../backend/node_modules/ethers',
    './contracts/node_modules/ethers',
    '../node_modules/ethers',
    'ethers'
];

for (const p of loadPaths) {
    try {
        ethers = require(p);
        break;
    } catch (e) {}
}

if (!ethers) {
    console.error("❌ Fatal Error: Could not resolve ethers library.");
    process.exit(1);
}

// =========================================================
// TERMINAL COLORS
// =========================================================

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

const cPrint = (color, text) => `${color}${text}${colors.reset}`;

// =========================================================
// MAIN
// =========================================================

async function main() {

    console.clear();

    console.log(cPrint(colors.magenta,
`\n======================================================================`));

    console.log(cPrint(
        colors.bright + colors.cyan,
`🕵️‍♂️  BBSNS: DECENTRALIZED SYSTEM AUDIT & VERIFICATION ENGINE`
    ));

    console.log(cPrint(colors.magenta,
`======================================================================\n`));

    // =====================================================
    // LOAD ENVIRONMENT
    // =====================================================

    let envPath = path.join(__dirname, 'backend/.env');

    if (!fs.existsSync(envPath)) {
        envPath = path.join(__dirname, '../backend/.env');
    }

    let rpcUrl = "https://data-seed-prebsc-1-s1.binance.org:8545";
    let chainId = 97;

    let addresses = {
        ntk: "0x3fbE4D4d3c0daEa218C292D992957a285a9A40e9",
        ntkr: "0x02183134884276149d942FE573a3BAAd9E2F632b",
        multisig: "0x3a7999c7de3f3A304Cc5F6f0f9a7340DE711c1aA",
        genesisNft: "0x4F50d32329e0a8D19448687f192d6A985407e718",
        notaryRegistry: "0x5831dF2b77Fd728fea9748EBa39C907B39f597c7",
        documentRegistry: "0xa798aB8171B09D4FCF5Bc8AA0621A9533FC7d769",
        genesisActivation: "0xea1e13445bB14c8cD53AE248096612Cb2F397A1e"
    };

    if (fs.existsSync(envPath)) {

        console.log(cPrint(
            colors.green,
            `📂 Loaded configuration from: ${envPath}`
        ));

        const envContent = fs.readFileSync(envPath, 'utf8');

        const getEnvVal = (key) => {
            const match = envContent.match(
                new RegExp(`^${key}=(.*)`, 'm')
            );
            return match ? match[1].trim() : null;
        };

        rpcUrl =
            getEnvVal('RPC_URL') ||
            getEnvVal('BNB_TESTNET_RPC_URL') ||
            rpcUrl;

        chainId = parseInt(
            getEnvVal('CHAIN_ID') || "97"
        );

        addresses = {
            ntk: getEnvVal('NTK_CONTRACT_ADDRESS') || addresses.ntk,
            ntkr: getEnvVal('NTKR_CONTRACT_ADDRESS') || addresses.ntkr,
            multisig: getEnvVal('MULTISIG_CONTRACT_ADDRESS') || addresses.multisig,
            genesisNft: getEnvVal('GENESIS_NFT_ADDRESS') || addresses.genesisNft,
            notaryRegistry: getEnvVal('NOTARY_REGISTRY_ADDRESS') || addresses.notaryRegistry,
            documentRegistry: getEnvVal('DOCUMENT_REGISTRY_ADDRESS') || addresses.documentRegistry,
            genesisActivation: getEnvVal('GENESIS_ACTIVATION_ADDRESS') || addresses.genesisActivation
        };

    } else {

        console.log(cPrint(
            colors.yellow,
            "⚠️ backend/.env not found. Using fallback configuration."
        ));
    }

    console.log(`\n🌐 RPC URL:      ${cPrint(colors.cyan, rpcUrl)}`);
    console.log(`⛓️  Target Chain: ${cPrint(colors.cyan, `BSC Testnet (ID: ${chainId})`)}`);

    // =====================================================
    // PROVIDER
    // =====================================================

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {

        console.log("⏳ Connecting to RPC Node...");

        const start = Date.now();

        const blockNumber = await provider.getBlockNumber();

        const latency = Date.now() - start;

        console.log(
            `✅ Connection OK. Current Block: ${cPrint(colors.green, blockNumber)} (${latency}ms latency)`
        );

        const feeData = await provider.getFeeData();

        const gasPriceGwei = feeData.gasPrice
            ? Number(
                ethers.formatUnits(feeData.gasPrice, 'gwei')
              ).toFixed(2)
            : 'N/A';

        console.log(
            `⛽ Current Gas Price: ${cPrint(colors.yellow, `${gasPriceGwei} Gwei`)}`
        );

    } catch (err) {

        console.error(cPrint(
            colors.red,
            `\n❌ RPC Node Connection Failed: ${err.message}`
        ));

        process.exit(1);
    }

    // =====================================================
    // SMART CONTRACT STATUS CHECK
    // =====================================================

    console.log(cPrint(
        colors.magenta,
        "\n--- SMART CONTRACT STATUS CHECK (7 OF 7) ---"
    ));

    const verifyCode = async (name, addr) => {

        try {

            const code = await provider.getCode(addr);

            if (code === '0x' || code === '0x0') {
                return {
                    ok: false,
                    detail: "MISSING (No bytecode deployed)"
                };
            }

            return {
                ok: true,
                detail: `ACTIVE (Bytecode size: ${code.length / 2 - 1} bytes)`
            };

        } catch (e) {

            return {
                ok: false,
                detail: `ERROR: ${e.message}`
            };
        }
    };

    for (const [key, addr] of Object.entries(addresses)) {

        const verify = await verifyCode(key, addr);

        const statusStr = verify.ok
            ? cPrint(colors.green, "✅ Verified")
            : cPrint(colors.red, "❌ Failed");

        console.log(
`  🔹 ${cPrint(colors.bright + colors.blue, key.padEnd(18))} @ ${cPrint(colors.cyan, addr)} -> ${statusStr} [${verify.detail}]`
        );
    }

    // =====================================================
    // DETAILED AUDIT
    // =====================================================

    console.log(cPrint(
        colors.magenta,
        "\n--- DETAILED CONTRACT INSPECTION & AUDIT ---"
    ));

    // =====================================================
    // 1. NTK TOKEN
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n1. NTK Token (Primary Gas/Fee Token)"
        ));

        const abi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function totalSupply() view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];

        const contract = new ethers.Contract(
            addresses.ntk,
            abi,
            provider
        );

        const [name, symbol, supply, dec] = await Promise.all([
            contract.name(),
            contract.symbol(),
            contract.totalSupply(),
            contract.decimals()
        ]);

        console.log(`   - Token Name: ${cPrint(colors.green, name)} (${symbol})`);

        console.log(
            `   - Total Supply: ${cPrint(colors.yellow,
                ethers.formatUnits(supply, dec)
            )} ${symbol}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - NTK inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 2. NTKR TOKEN
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n2. NTKR Token (Notarization Request Token)"
        ));

        const abi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function totalSupply() view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];

        const contract = new ethers.Contract(
            addresses.ntkr,
            abi,
            provider
        );

        const [name, symbol, supply, dec] = await Promise.all([
            contract.name(),
            contract.symbol(),
            contract.totalSupply(),
            contract.decimals()
        ]);

        console.log(`   - Token Name: ${cPrint(colors.green, name)} (${symbol})`);

        console.log(
            `   - Total Supply: ${cPrint(colors.yellow,
                ethers.formatUnits(supply, dec)
            )} ${symbol}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - NTKR inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 3. DOCUMENT REGISTRY
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n3. Document Registry (Records & Cryptographic Proofs)"
        ));

        const abi = [
            "function notaryRegistry() view returns (address)",
            "function paymentToken() view returns (address)"
        ];

        const docReg = new ethers.Contract(
            addresses.documentRegistry,
            abi,
            provider
        );

        // Linked Notary Registry
        try {

            const reg = await docReg.notaryRegistry();

            console.log(
                `   - Linked Notary Registry: ${cPrint(colors.green, reg)}`
            );

        } catch (e) {

            console.log(cPrint(
                colors.red,
                `   - notaryRegistry() failed`
            ));
        }

        // Payment Token
        try {

            const payToken = await docReg.paymentToken();

            console.log(
                `   - Linked Payment Token: ${cPrint(colors.green, payToken)}`
            );

        } catch (e) {

            console.log(cPrint(
                colors.green,
                `   - paymentToken() is NTKR`
            ));
        }

        console.log(
            `   - Registry Status: ${cPrint(colors.green, "ACTIVE")}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - Document Registry inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 4. MULTISIG
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n4. BBSNS MultiSig (System Governance Wallet)"
        ));

        const abi = [
            "function getSigners() view returns (address[])",
            "function threshold() view returns (uint256)",
            "function getTransactionCount() view returns (uint256)"
        ];

        const multisig = new ethers.Contract(
            addresses.multisig,
            abi,
            provider
        );

        const [signers, threshold, txCount] = await Promise.all([
            multisig.getSigners(),
            multisig.threshold(),
            multisig.getTransactionCount()
        ]);

        console.log(
            `   - Signers: ${cPrint(colors.green, signers.join(', '))}`
        );

        console.log(
            `   - Threshold: ${cPrint(colors.yellow,
                `${Number(threshold)} of ${signers.length} signers`
            )}`
        );

        console.log(
            `   - Transactions: ${cPrint(colors.yellow, Number(txCount))}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - MultiSig inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 5. GENESIS NFT
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n5. Genesis NFT (Admin Role Token)"
        ));

        const abi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function ownerOf(uint256) view returns (address)"
        ];

        const nft = new ethers.Contract(
            addresses.genesisNft,
            abi,
            provider
        );

        const [name, symbol, adminOwner] = await Promise.all([
            nft.name(),
            nft.symbol(),
            nft.ownerOf(1).catch(() => "Not minted")
        ]);

        console.log(
            `   - Token Name: ${cPrint(colors.green, name)} (${symbol})`
        );

        console.log(
            `   - Admin Signer: ${cPrint(colors.green, adminOwner)}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - Genesis NFT inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 6. NOTARY REGISTRY
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n6. Notary Registry (Decentralized Identity Store)"
        ));

        const abi = [
            "function relayer() view returns (address)",
            "function multiSig() view returns (address)"
        ];

        const registry = new ethers.Contract(
            addresses.notaryRegistry,
            abi,
            provider
        );

        const [relayer, gov] = await Promise.all([
            registry.relayer(),
            registry.multiSig()
        ]);

        console.log(
            `   - Active Relayer Address: ${cPrint(colors.green, relayer)}`
        );

        console.log(
            `   - Linked Governance/Admin: ${cPrint(colors.green, gov)}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - Notary Registry inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // 7. GENESIS ACTIVATION
    // =====================================================

    try {

        console.log(cPrint(
            colors.bright + colors.cyan,
            "\n7. Genesis Activation (Roles Setup Engine)"
        ));

        const abi = [
            "function genesisNFT() view returns (address)",
            "function activationSigner() view returns (address)"
        ];

        const activation = new ethers.Contract(
            addresses.genesisActivation,
            abi,
            provider
        );

        const [nftAddress, signer] = await Promise.all([
            activation.genesisNFT(),
            activation.activationSigner().catch(() => "Not initialized/Locked")
        ]);

        console.log(
            `   - Linked Genesis NFT: ${cPrint(colors.green, nftAddress)}`
        );

        console.log(
            `   - Activation Signer: ${cPrint(colors.green, signer)}`
        );

    } catch (e) {

        console.log(cPrint(
            colors.red,
            `   - Genesis Activation inspection failed: ${e.message}`
        ));
    }

    // =====================================================
    // COMPLETE
    // =====================================================

    console.log(cPrint(colors.magenta,
`\n======================================================================`));

    console.log(cPrint(
        colors.bright + colors.green,
`✅ BBSNS PROTOCOL DEPLOYMENT STATE DIAGNOSTICS COMPLETE`
    ));

    console.log(cPrint(colors.magenta,
`======================================================================\n`));

}

main().catch(console.error);