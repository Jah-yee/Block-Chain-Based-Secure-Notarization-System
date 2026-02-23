// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface INotaryRegistry {
    function isNotary(address _notary) external view returns (bool);
    function relayer() external view returns (address);
    function multiSig() external view returns (address);
    function isBanned(address _user) external view returns (bool);
}

interface INTKToken {
    function burnForAction(address notary) external;
}

/**
 * @title DocumentRegistry
 * @notice Central source of truth for BBSNS notarizations.
 * @dev Replaced msg.sender trust with EIP-712 structured signatures.
 * Cross-references NotaryRegistry for authorization, governance, and bans.
 */
contract DocumentRegistry is EIP712, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    INTKToken public ntkToken;
    INotaryRegistry public notaryRegistry;

    enum Status { PENDING, APPROVED, REJECTED }

    struct DocumentRecord {
        address notary;
        uint256 timestamp;
        Status status;
        bool exists;
        bytes32 summaryHash;
        bytes32 rejectionReasonHash;
    }

    // TypeHash for EIP-712 signature verification
    // Notarize(bytes32 docHash,address ownerAddress,uint8 status,bytes32 summaryHash,bytes32 rejectionReasonHash,uint256 timestamp,uint256 nonce)
    bytes32 private constant NOTARIZE_TYPEHASH = keccak256("Notarize(bytes32 docHash,address ownerAddress,uint8 status,bytes32 summaryHash,bytes32 rejectionReasonHash,uint256 timestamp,uint256 nonce)");

    mapping(bytes32 => DocumentRecord) public documents;
    mapping(address => uint256) public nonces;

    event DocumentRecorded(bytes32 indexed docHash, address indexed notary, Status status, bytes32 summaryHash, bytes32 rejectionReasonHash, uint256 timestamp);
    event GovernanceActionRecorded(string targetId, string actionType, address indexed executor, uint256 timestamp);
    event GovernanceVoteRecorded(uint256 indexed proposalId, address indexed voter, string decision, string signature, uint256 timestamp);
    event UserBan(address indexed user, bytes32 reasonHash, address indexed bannedBy);

    modifier onlyRelayer() {
        require(msg.sender == notaryRegistry.relayer(), "DocumentRegistry: Not authorized relayer");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == notaryRegistry.multiSig(), "DocumentRegistry: Not authorized governance");
        _;
    }

    constructor(address _notaryRegistry, address _ntkToken) 
        EIP712("BBSNS_Protocol", "1") 
    {
        notaryRegistry = INotaryRegistry(_notaryRegistry);
        ntkToken = INTKToken(_ntkToken);
    }

    /**
     * @notice Records a notarization action via an EIP-712 signature.
     * @dev Restricted to onlyRelayer. Signature must be from an authorized, non-banned Notary.
     * @param docHash The SHA-256 hash of the notarized document.
     * @param ownerAddress The address of the document owner.
     * @param status The decision (1 = APPROVED, 2 = REJECTED).
     * @param timestamp The time the notary signed the document.
     * @param nonce The per-notary sequential nonce.
     * @param signature The EIP-712 signature from the authorized Notary.
     */
    function recordAction(
        bytes32 docHash, 
        address ownerAddress,
        uint8 status, 
        bytes32 summaryHash,
        bytes32 rejectionReasonHash,
        uint256 timestamp, 
        uint256 nonce,
        bytes memory signature
    ) external whenNotPaused onlyRelayer nonReentrant {
        // 1. Basic State Validation
        require(!documents[docHash].exists, "DocumentRegistry: Record already exists");
        require(status == uint8(Status.APPROVED) || status == uint8(Status.REJECTED), "DocumentRegistry: Invalid status");
        
        // 2. Timestamp Guards (Future & Expiry)
        require(timestamp <= block.timestamp + 5 minutes, "DocumentRegistry: Future signature");
        require(block.timestamp <= timestamp + 1 days, "DocumentRegistry: Signature expired");

        // 3. Signature Recovery
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            NOTARIZE_TYPEHASH,
            docHash,
            ownerAddress,
            status,
            summaryHash,
            rejectionReasonHash,
            timestamp,
            nonce
        )));
        address recoveredNotary = digest.recover(signature);
        
        // 4. Identity & Authority Validation
        require(notaryRegistry.isNotary(recoveredNotary), "DocumentRegistry: Signer is not an authorized Notary");
        require(!notaryRegistry.isBanned(recoveredNotary), "DocumentRegistry: Notary is banned");
        require(!notaryRegistry.isBanned(ownerAddress), "DocumentRegistry: Document owner is banned");
        require(recoveredNotary != ownerAddress, "DocumentRegistry: Notary cannot approve own document");

        // 5. Nonce Protection
        require(nonce == nonces[recoveredNotary], "DocumentRegistry: Invalid nonce");

        // 6. Cryptographic Fuel Check (Burn after all validations)
        ntkToken.burnForAction(recoveredNotary);

        // 7. Success State Write
        documents[docHash] = DocumentRecord({
            notary: recoveredNotary,
            timestamp: block.timestamp,
            status: Status(status),
            exists: true,
            summaryHash: summaryHash,
            rejectionReasonHash: rejectionReasonHash
        });
        
        nonces[recoveredNotary]++;

        emit DocumentRecorded(docHash, recoveredNotary, Status(status), summaryHash, rejectionReasonHash, block.timestamp);
    }

    /**
     * @dev Records a governance action (Only Governance).
     */
    function recordGovernanceAction(string calldata targetId, string calldata actionType, address executor) external onlyGovernance {
        emit GovernanceActionRecorded(targetId, actionType, executor, block.timestamp);
    }

    /**
     * @dev Records an individual governance vote (Only Governance).
     */
    function recordVote(uint256 proposalId, address voter, string calldata decision, string calldata signature) external onlyGovernance {
        emit GovernanceVoteRecorded(proposalId, voter, decision, signature, block.timestamp);
    }

    /**
     * @dev Records a user ban on-chain (Only Governance).
     */
    function banUser(address user, bytes32 reasonHash) external onlyGovernance {
        emit UserBan(user, reasonHash, msg.sender);
    }

    /**
     * @notice Circuit Breaker: Pause notarizations.
     */
    function pause() external onlyGovernance {
        _pause();
    }

    function unpause() external onlyGovernance {
        _unpause();
    }

    // Helpers
    function getDocument(bytes32 docHash) external view returns (address notary, uint256 timestamp, Status status, bool exists) {
        DocumentRecord memory doc = documents[docHash];
        return (doc.notary, doc.timestamp, doc.status, doc.exists);
    }
}
