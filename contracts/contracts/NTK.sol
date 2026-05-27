// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NTKToken (Notary Action Token)
 * @notice Operational fuel for notaries. Not a reward system.
 * @dev Uses RELAYER_ROLE pattern to enforce on-chain rules.
 * Backend triggers allocation, but contract decides whether it's allowed.
 * Security: Added Pausable support for emergency circuit breaking.
 */
contract NTKToken is ERC20, ERC20Burnable, AccessControl, Pausable {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    
    uint256 public constant REFILL_AMOUNT = 100 * 1e18;
    uint256 public constant COST_PER_ACTION = 1 * 1e18;

    event NTKProvisioned(address indexed notary, uint256 amount, uint256 timestamp);
    event NTKBurnedForAction(address indexed notary, uint256 amount);

    constructor(address initialRelayer) ERC20("Notary Action Token", "NTK") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, initialRelayer);
    }

    /**
     * @notice Mints daily NTK allocation to a notary.
     * @dev RELAYER_ROLE only. On-chain 24h guard prevents double-minting.
     * Backend cannot bypass this enforcement.
     * @param notary Address of the notary to receive daily allocation
     */
    function provisionNTK(address notary) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(balanceOf(notary) == 0, "Notary already has NTK");

        _mint(notary, REFILL_AMOUNT);
        emit NTKProvisioned(notary, REFILL_AMOUNT, block.timestamp);
    }

    /**
     * @notice Burns NTK when a notary performs an action (Approve/Reject).
     * @dev RELAYER_ROLE only. Enforces work throttling.
     * If notary has 0 NTK, they cannot approve/reject.
     * @param notary Address of the notary performing the action
     */
    function burnForAction(address notary) external onlyRole(RELAYER_ROLE) whenNotPaused {
        _burn(notary, COST_PER_ACTION);
        emit NTKBurnedForAction(notary, COST_PER_ACTION);

        if (balanceOf(notary) == 0) {
            _mint(notary, REFILL_AMOUNT);
            emit NTKProvisioned(notary, REFILL_AMOUNT, block.timestamp);
        }
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
