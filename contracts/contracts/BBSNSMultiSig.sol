// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title BBSNSMultiSig
 * @notice Professional execution-only Multi-Sig wallet for BBSNS Governance.
 * @dev Handles on-chain execution of administrative actions once M-of-N threshold is met.
 * Features: Timelock, Signer Rotation, and threshold management.
 */
contract BBSNSMultiSig is ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    event TransactionSubmitted(uint256 indexed txIndex, address indexed proposer, address[] to, uint256[] value, bytes[] data, bytes32 proposalHash);
    event TransactionConfirmed(uint256 indexed txIndex, address indexed confirmer);
    event TransactionRevoked(uint256 indexed txIndex, address indexed revoker);
    event TransactionExecuted(uint256 indexed txIndex, address indexed executor, address to, uint256 value);
    event SignerAdded(address indexed newSigner);
    event SignerRemoved(address indexed oldSigner);
    event ThresholdChanged(uint256 newThreshold);
    event TimelockChanged(uint256 newDelay);

    struct Transaction {
        address[] to;
        uint256[] value;
        bytes[] data;
        bool executed;
        uint256 numConfirmations;
        uint256 submissionTime;
        uint256 signerVersion; // Invalidate confirmations if signers rotate
        bytes32 proposalHash;
    }

    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public threshold;
    uint256 public timelockDelay; 
    uint256 public signerVersion; // Incremented on any signer or threshold change

    Transaction[] public transactions;
    // txIndex => signer => confirmed
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    modifier onlySelf() {
        require(msg.sender == address(this), "MultiSig: Only self-call allowed");
        _;
    }

    modifier onlySigner() {
        require(isSigner[msg.sender], "MultiSig: Not a signer");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "MultiSig: Transaction does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "MultiSig: Transaction already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "MultiSig: Transaction already confirmed");
        _;
    }

    constructor(address[] memory _signers, uint256 _threshold, uint256 _timelockDelay) EIP712("BBSNS_Protocol", "2") {
        require(_signers.length > 0, "MultiSig: Signers required");
        require(_threshold > 0 && _threshold <= _signers.length, "MultiSig: Invalid threshold");

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "MultiSig: Invalid signer address");
            require(!isSigner[signer], "MultiSig: Signer not unique");

            isSigner[signer] = true;
            signers.push(signer);
        }

        threshold = _threshold;
        timelockDelay = _timelockDelay;
        signerVersion = 1;
    }

    /**
     * @notice Submits a new transaction for approval.
     */
    function submitTransaction(address[] memory _to, uint256[] memory _value, bytes[] memory _data, bytes32 _proposalHash) public onlySigner {
        require(_to.length == _value.length && _to.length == _data.length, "MultiSig: Array lengths mismatch");
        require(_to.length > 0, "MultiSig: Empty execution arrays");
        uint256 txIndex = transactions.length;

        transactions.push(Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false,
            numConfirmations: 0,
            submissionTime: block.timestamp,
            signerVersion: signerVersion,
            proposalHash: _proposalHash
        }));

        emit TransactionSubmitted(txIndex, msg.sender, _to, _value, _data, _proposalHash);
        
        // Auto-confirm for the proposer
        confirmTransaction(txIndex);
    }

    /**
     * @notice Confirms a pending transaction.
     */
    function confirmTransaction(uint256 _txIndex) 
        public 
        onlySigner 
        txExists(_txIndex) 
        notExecuted(_txIndex) 
        notConfirmed(_txIndex) 
        nonReentrant
    {
        Transaction storage transaction = transactions[_txIndex];
        require(transaction.signerVersion == signerVersion, "MultiSig: Signer set rotated since submission");

        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;

        emit TransactionConfirmed(_txIndex, msg.sender);

        if (transaction.numConfirmations >= threshold && block.timestamp >= transaction.submissionTime + timelockDelay) {
            transaction.executed = true;
            for (uint256 i = 0; i < transaction.to.length; i++) {
                (bool success, ) = transaction.to[i].call{value: transaction.value[i]}(transaction.data[i]);
                require(success, "MultiSig: Transaction execution failed");
                emit TransactionExecuted(_txIndex, msg.sender, transaction.to[i], transaction.value[i]);
            }
        }
    }

    /**
     * @notice Revokes a previously cast confirmation.
     */
    function revokeConfirmation(uint256 _txIndex) 
        public 
        onlySigner 
        txExists(_txIndex) 
        notExecuted(_txIndex) 
    {
        require(isConfirmed[_txIndex][msg.sender], "MultiSig: Transaction not confirmed");

        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;

        emit TransactionRevoked(_txIndex, msg.sender);
    }



    /**
     * @notice Executes a transaction once threshold and timelock are met.
     */
    function executeTransaction(uint256 _txIndex) 
        public 
        onlySigner 
        txExists(_txIndex) 
        notExecuted(_txIndex) 
        nonReentrant 
    {
        Transaction storage transaction = transactions[_txIndex];

        require(transaction.numConfirmations >= threshold, "MultiSig: Threshold not met");
        require(block.timestamp >= transaction.submissionTime + timelockDelay, "MultiSig: Timelock active");
        require(transaction.signerVersion == signerVersion, "MultiSig: Signer set rotated since submission");

        transaction.executed = true;

        for (uint256 i = 0; i < transaction.to.length; i++) {
            (bool success, ) = transaction.to[i].call{value: transaction.value[i]}(transaction.data[i]);
            require(success, "MultiSig: Transaction execution failed");
            emit TransactionExecuted(_txIndex, msg.sender, transaction.to[i], transaction.value[i]);
        }
    }

    /**
     * @notice Rotates signers or changes threshold (Only via self-execution).
     */
    function _addSigner(address _newSigner) internal {
        require(_newSigner != address(0), "MultiSig: Invalid address");
        require(!isSigner[_newSigner], "MultiSig: Address is already a signer");

        isSigner[_newSigner] = true;
        signers.push(_newSigner);
        signerVersion++;

        threshold = (signers.length / 2) + 1;
        emit ThresholdChanged(threshold);
        emit SignerAdded(_newSigner);
    }

    function _removeSigner(address _oldSigner) internal {
        require(isSigner[_oldSigner], "MultiSig: Not a signer");

        isSigner[_oldSigner] = false;
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == _oldSigner) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }
        signerVersion++;

        if (signers.length > 0) {
            threshold = (signers.length / 2) + 1;
        } else {
            threshold = 0;
        }
        emit ThresholdChanged(threshold);
        emit SignerRemoved(_oldSigner);
    }

    function addSigner(address _newSigner) public onlySelf {
        _addSigner(_newSigner);
    }

    function removeSigner(address _oldSigner) public onlySelf {
        _removeSigner(_oldSigner);
    }

    function promoteAdmin(address _newAdmin, address _registry) public onlySelf {
        _addSigner(_newAdmin);
        if (_registry != address(0)) {
            (bool success, ) = _registry.call(abi.encodeWithSignature("promoteToAdmin(address)", _newAdmin));
            require(success, "Registry call failed");
        }
    }

    function demoteAdmin(address _admin, address _registry) public onlySelf {
        _removeSigner(_admin);
        if (_registry != address(0)) {
            (bool success, ) = _registry.call(abi.encodeWithSignature("removeRole(address)", _admin));
            require(success, "Registry call failed");
        }
    }

    function setTimelockDelay(uint256 _newDelay) public onlySelf {
        timelockDelay = _newDelay;
        signerVersion++; // Also invalidate if security parameters change
        emit TimelockChanged(_newDelay);
    }

    // --- Helper Functions ---

    function getSigners() public view returns (address[] memory) {
        return signers;
    }

    function getTransactionCount() public view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _txIndex) public view returns (
        address[] memory to, 
        uint256[] memory value, 
        bytes[] memory data, 
        bool executed, 
        uint256 numConfirmations, 
        uint256 submissionTime,
        uint256 txSignerVersion
    ) {
        Transaction storage txReq = transactions[_txIndex];
        return (
            txReq.to,
            txReq.value,
            txReq.data,
            txReq.executed,
            txReq.numConfirmations,
            txReq.submissionTime,
            txReq.signerVersion
        );
    }

    receive() external payable {}
}
