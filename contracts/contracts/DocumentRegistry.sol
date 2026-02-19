// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface INotaryRegistry {
    function isNotary(address _notary) external view returns (bool);
}

interface INTKToken {
    function burnForAction(address notary) external;
}

/**
 * @title DocumentRegistry
 * @notice Central source of truth for BBSNS notarizations.
 * @dev Replaced msg.sender trust with EIP-712 structured signatures.
 * Cross-references NotaryRegistry for authorization.
 */
contract DocumentRegistry is Ownable, EIP712, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    INTKToken public ntkToken;

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
    // Notarize(bytes32 docHash,uint8 status,bytes32 summaryHash,bytes32 rejectionReasonHash,uint256 timestamp)
    bytes32 private constant NOTARIZE_TYPEHASH = keccak256("Notarize(bytes32 docHash,uint8 status,bytes32 summaryHash,bytes32 rejectionReasonHash,uint256 timestamp)");

    INotaryRegistry public notaryRegistry;
    mapping(bytes32 => DocumentRecord) public documents;
    mapping(bytes32 => bool) public usedSignatures; // Replay protection

    event DocumentRecorded(bytes32 indexed docHash, address indexed notary, Status status, bytes32 summaryHash, bytes32 rejectionReasonHash, uint256 timestamp);
    event GovernanceActionRecorded(string targetId, string actionType, address indexed executor, uint256 timestamp);
    event GovernanceVoteRecorded(uint256 indexed proposalId, address indexed voter, string decision, string signature, uint256 timestamp);
    event UserBan(address indexed user, bytes32 reasonHash, address indexed bannedBy);

    constructor(address _owner, address _notaryRegistry, address _ntkToken) 
        Ownable(_owner) 
        EIP712("BBSNS_Protocol", "1") 
    {
        notaryRegistry = INotaryRegistry(_notaryRegistry);
        ntkToken = INTKToken(_ntkToken);
    }

    /**
     * @notice Records a notarization action via an EIP-712 signature.
     * @dev This can be called by anyone (Relayer) as long as the signature is valid.
     * @param docHash The SHA-256 hash of the notarized document.
     * @param status The decision (1 = APPROVED, 2 = REJECTED).
     * @param timestamp The time the notary signed the document.
     * @param signature The EIP-712 signature from the authorized Notary.
     */
    function recordAction(
        bytes32 docHash, 
        uint8 status, 
        bytes32 summaryHash,
        bytes32 rejectionReasonHash,
        uint256 timestamp, 
        bytes memory signature
    ) external whenNotPaused nonReentrant {
        require(!documents[docHash].exists, "DocumentRegistry: Record already exists");
        require(status == uint8(Status.APPROVED) || status == uint8(Status.REJECTED), "DocumentRegistry: Invalid status");
        
        // 1. Replay Protection: Prevent signature reuse
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            NOTARIZE_TYPEHASH,
            docHash,
            status,
            summaryHash,
            rejectionReasonHash,
            timestamp
        )));
        require(!usedSignatures[digest], "DocumentRegistry: Signature already used");

        // 2. Recover Signer
        address recoveredNotary = digest.recover(signature);
        
        // 3. Verify Authorization
        require(notaryRegistry.isNotary(recoveredNotary), "DocumentRegistry: Signer is not an authorized Notary");

        // 4. Enforce NTK Burn (Cryptographic fuel check)
        // This will revert if the notary has insufficient NTK balance
        ntkToken.burnForAction(recoveredNotary);

        // Professional Refinement: Timestamp window validation (e.g., 24h)
        require(block.timestamp <= timestamp + 1 days, "DocumentRegistry: Signature expired");

        // Record entry
        documents[docHash] = DocumentRecord({
            notary: recoveredNotary,
            timestamp: block.timestamp,
            status: Status(status),
            exists: true,
            summaryHash: summaryHash,
            rejectionReasonHash: rejectionReasonHash
        });
        usedSignatures[digest] = true;

        emit DocumentRecorded(docHash, recoveredNotary, Status(status), summaryHash, rejectionReasonHash, block.timestamp);
    }

    /**
     * @dev Records a governance action (Only Multi-Sig).
     */
    function recordGovernanceAction(string calldata targetId, string calldata actionType, address executor) external onlyOwner {
        emit GovernanceActionRecorded(targetId, actionType, executor, block.timestamp);
    }

    /**
     * @dev Records an individual governance vote (Only Multi-Sig).
     */
    function recordVote(uint256 proposalId, address voter, string calldata decision, string calldata signature) external onlyOwner {
        emit GovernanceVoteRecorded(proposalId, voter, decision, signature, block.timestamp);
    }

    /**
     * @dev Records a user ban on-chain.
     * @param user The address of the user being banned.
     * @param reasonHash SHA-256 hash of the ban reason.
     */
    function banUser(address user, bytes32 reasonHash) external onlyOwner {
        emit UserBan(user, reasonHash, msg.sender);
    }

    /**
     * @notice Circuit Breaker: Pause notarizations.
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Helpers
    function getDocument(bytes32 docHash) external view returns (address notary, uint256 timestamp, Status status, bool exists) {
        DocumentRecord memory doc = documents[docHash];
        return (doc.notary, doc.timestamp, doc.status, doc.exists);
    }
}
