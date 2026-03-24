// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INotaryRegistry {
    function assignOwner(address _user) external;
    function promoteToNotary(address _user) external;
    function promoteToAdmin(address _user) external;
    function transferGovernance(address newGov) external;
    function getUserRole(address _user) external view returns (uint8);
}

interface IOwnable {
    function owner() external view returns (address);
}

interface IGenesisNFT {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title GenesisActivation
 * @notice A one-time activation contract to safely initialize the first Admin in BBSNS.
 * @dev Replaces the hardcoded deploy script initialization. Inherently disables itself after one use.
 */
contract GenesisActivation {
    INotaryRegistry public notaryRegistry;
    IGenesisNFT public genesisNFT;
    address public targetMultiSig;
    address public owner;
    
    bool public activated;
    bool public registryInitialized;
    uint256 public activationBlockNumber;
    uint256 public activationTimestamp;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Throws if the contract has already been activated. Makes it a dead contract.
     */
    modifier notActivated() {
        require(!activated, "Genesis disabled");
        _;
    }

    constructor(address _genesisNFT, address _targetMultiSig) {
        require(_genesisNFT != address(0), "Invalid NFT");
        require(_targetMultiSig != address(0), "Invalid MultiSig");
        
        genesisNFT = IGenesisNFT(_genesisNFT);
        targetMultiSig = _targetMultiSig;
        owner = msg.sender;
    }

    /**
     * @notice Initializes the NotaryRegistry address.
     * @dev Solves circular dependency. Can only be called once, by owner, before activation.
     */
    function initializeRegistry(address _notaryRegistry) external onlyOwner notActivated {
        require(!registryInitialized, "Already initialized");
        require(_notaryRegistry != address(0), "Invalid registry");
        
        notaryRegistry = INotaryRegistry(_notaryRegistry);
        registryInitialized = true;
    }

    /**
     * @notice Activates the system by checking for the NFT, granting roles, transferring governance, and disabling itself atomically.
     */
    function activate() external notActivated {
        require(registryInitialized, "Registry not initialized");
        // 1. Check NFT balance (Must hold at least 1, though only 1 should ever exist)
        require(genesisNFT.balanceOf(msg.sender) >= 1, "Invalid NFT");

        // 2. Defensive check: Ensure caller has no existing role
        require(notaryRegistry.getUserRole(msg.sender) == 0, "Already has a role");

        // NOTE: external calls trusted (NotaryRegistry), must remain immutable
        // 3. Assign linear roles leading up to Admin
        notaryRegistry.assignOwner(msg.sender);
        notaryRegistry.promoteToNotary(msg.sender);
        notaryRegistry.promoteToAdmin(msg.sender);

        // 3. Transfer governance to permanently lock this contract out
        notaryRegistry.transferGovernance(targetMultiSig);

        // 4. Lock everything for self-destruction
        activated = true;
        activationBlockNumber = block.number;
        activationTimestamp = block.timestamp;
    }
}
