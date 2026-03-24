// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GenesisNFT
 * @notice A Soulbound NFT used exclusively to authorize the initialization of the BBSNS system.
 * @dev Only the owner (deployer) can mint exactly one token. Non-transferable.
 */
contract GenesisNFT is ERC721, Ownable {
    bool public hasMinted;

    constructor() ERC721("BBSNS Genesis Authorization", "BBSNS-GENESIS") Ownable(msg.sender) {}

    /**
     * @notice Mints the single allowed Genesis NFT.
     * @param to The target address that will receive the activation right.
     */
    function mintGenesis(address to) external onlyOwner {
        require(msg.sender == tx.origin, "GenesisNFT: EOA only - Contracts not allowed");
        require(!hasMinted, "Genesis already minted");
        hasMinted = true;
        _mint(to, 1);
    }

    /**
     * @notice Prevents transferring the NFT, making it Soulbound.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Only minting is allowed (from == address(0)). No transfer, no burn.
        require(from == address(0), "Soulbound: Token is non-transferable/non-burnable");
        return super._update(to, tokenId, auth);
    }
}
