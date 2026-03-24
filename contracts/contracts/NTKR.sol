// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NTKRToken (Notarization Request Token)
 * @notice Reputation and access token for submitting notarization requests.
 * @dev Implements on-chain price tiers and daily caps.
 * Security: Added Pausable support for emergency circuit breaking.
 */
contract NTKRToken is ERC20, AccessControl, Pausable {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    enum Category { BASIC, OFFICIAL, HIGH_VALUE }
    
    struct Package {
        uint256 bnbCost;
        uint256 ntkrAmount;
        uint256 dailyLimit;
    }

    mapping(Category => uint256) public categoryPrices;
    mapping(uint256 => Package) public packages;
    
    // User Stats
    mapping(address => uint256) public userDailyLimit;
    mapping(address => uint256) public lastSubmissionDay;
    mapping(address => uint256) public dailySubmissionCount;

    // Relayer Distribution Limits
    mapping(address => uint256) public lastMintedAt;
    uint256 public constant COOLDOWN = 1 days;
    uint256 public constant MAX_PER_USER = 100 * 1e18;

    address public treasury;

    event PackagePurchased(address indexed user, uint256 packageId, uint256 amount);
    event TokensConsumed(address indexed user, Category category, uint256 amount);
    event TokensMinted(address indexed user, uint256 amount);
    /// @notice Emitted when a user burns NTKR to pay for a document upload.
    /// @param user    The token holder who signed this transaction.
    /// @param amount  Exact amount burned (in wei, 18 decimals).
    /// @param intentId The upload intent UUID encoded as bytes32 — used by backend to match this burn.
    event BurnedForUpload(address indexed user, uint256 amount, bytes32 intentId);

    constructor(address initialRelayer, address initialTreasury) ERC20("Notarization Request Token", "NTKR") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, initialRelayer);
        treasury = initialTreasury;

        // Initialize Prices
        categoryPrices[Category.BASIC] = 1 * 10**18;
        categoryPrices[Category.OFFICIAL] = 5 * 10**18;
        categoryPrices[Category.HIGH_VALUE] = 10 * 10**18;

        // Initialize Packages (Test Costs: 0.001, 0.002, 0.003 BNB)
        packages[1] = Package(0.001 ether, 5 * 10**18, 3);
        packages[2] = Package(0.002 ether, 15 * 10**18, 5);
        packages[3] = Package(0.003 ether, 30 * 10**18, 10);
    }

    /**
     * @dev Restricted minting for the Relayer. 
     * Backend cannot bypass these on-chain limits.
     */
    function mintNTKR(address user, uint256 amount) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(block.timestamp - lastMintedAt[user] >= COOLDOWN, "Relayer: Cooldown active");
        require(balanceOf(user) + amount <= MAX_PER_USER, "Relayer: Max balance exceeded");

        _mint(user, amount);
        lastMintedAt[user] = block.timestamp;
        
        // Ensure user has at least a basic daily limit set if they are being onboarded via relayer
        if (userDailyLimit[user] == 0) {
            userDailyLimit[user] = 3;
        }

        emit TokensMinted(user, amount);
    }

    function buyPackage(uint256 packageId) external payable whenNotPaused {
        Package memory pkg = packages[packageId];
        require(pkg.bnbCost > 0, "Invalid package");
        require(msg.value >= pkg.bnbCost, "Insufficient BNB");
        require(balanceOf(msg.sender) + pkg.ntkrAmount <= MAX_PER_USER, "Max balance exceeded");

        _mint(msg.sender, pkg.ntkrAmount);
        userDailyLimit[msg.sender] = pkg.dailyLimit;
        
        emit PackagePurchased(msg.sender, packageId, pkg.ntkrAmount);
        
        // Treasury Transfer (Admin controlled)
        payable(treasury).transfer(msg.value);
    }

    /**
     * @dev Processed by backend Relayer. No BNB cost to user.
     */
    function sponsoredBuyPackage(address user, uint256 packageId) external onlyRole(RELAYER_ROLE) whenNotPaused {
        Package memory pkg = packages[packageId];
        require(pkg.bnbCost > 0, "Invalid package");
        require(balanceOf(user) + pkg.ntkrAmount <= MAX_PER_USER, "Max balance exceeded");

        _mint(user, pkg.ntkrAmount);
        userDailyLimit[user] = pkg.dailyLimit;
        
        emit PackagePurchased(user, packageId, pkg.ntkrAmount);
    }

    /**
     * @dev Backend calls this via Relayer when a document is submitted.
     * Enforces token cost + daily cap.
     */
    function consumeTokens(address user, Category category) external onlyRole(RELAYER_ROLE) whenNotPaused {
        uint256 price = categoryPrices[category];
        require(balanceOf(user) >= price, "Insufficient NTKR balance");

        // Daily Cap Enforcement
        uint256 today = block.timestamp / 1 days;
        if (today > lastSubmissionDay[user]) {
            dailySubmissionCount[user] = 0;
            lastSubmissionDay[user] = today;
        }

        require(dailySubmissionCount[user] < userDailyLimit[user], "Daily submission limit reached");

        _burn(user, price);
        dailySubmissionCount[user]++;
        
        emit TokensConsumed(user, category, price);
    }

    /**
     * @notice Called by the document owner to pay for an upload.
     *         User MUST sign this transaction themselves — no relayer.
     * @param amount   Amount of NTKR to burn (must match backend intent, in wei).
     * @param intentId Upload intent UUID encoded as bytes32. Binds this burn to one upload.
     */
    function burnForUpload(uint256 amount, bytes32 intentId) external whenNotPaused {
        require(amount > 0, "NTKR: amount must be positive");
        require(balanceOf(msg.sender) >= amount, "NTKR: insufficient balance");
        _burn(msg.sender, amount);
        emit BurnedForUpload(msg.sender, amount, intentId);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
    }
    
    // Admin helper to update prices
    function setCategoryPrice(Category category, uint256 price) external onlyRole(DEFAULT_ADMIN_ROLE) {
        categoryPrices[category] = price;
    }

    // Admin helper to update packages
    function setPackage(uint256 id, uint256 bnbCost, uint256 ntkrAmount, uint256 dailyLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        packages[id] = Package(bnbCost, ntkrAmount, dailyLimit);
    }

    /**
     * @notice Emergency circuit breaker.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
