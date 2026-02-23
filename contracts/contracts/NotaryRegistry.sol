// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NotaryRegistry
 * @notice On-chain registry of authorized Roles (OWNER, NOTARY, ADMIN) for BBSNS.
 * @dev Controlled strictly by BBSNSMultiSig. Enforces linear role transitions and admin continuity.
 */
contract NotaryRegistry {
    enum Role { NONE, OWNER, NOTARY, ADMIN }
    
    event RolePromoted(address indexed user, Role newRole, uint256 timestamp);
    event RoleRemoved(address indexed user, uint256 timestamp);
    event RelayerUpdated(address indexed newRelayer, uint256 timestamp);
    event UserBanned(address indexed user, bool status, uint256 timestamp);

    mapping(address => Role) public roles;
    mapping(address => bool) public isBanned;
    
    address public multiSig;
    address public relayer;
    uint256 public adminCount;

    modifier onlyGovernance() {
        require(msg.sender == multiSig, "NotaryRegistry: Not governance");
        _;
    }

    constructor(address _multiSig) {
        require(_multiSig != address(0), "Invalid MultiSig address");
        multiSig = _multiSig;
    }

    /**
     * @notice Updates the relayer address.
     * @param _newRelayer The new relayer address.
     */
    function updateRelayer(address _newRelayer) external onlyGovernance {
        require(_newRelayer != address(0), "NotaryRegistry: Invalid relayer");
        relayer = _newRelayer;
        emit RelayerUpdated(_newRelayer, block.timestamp);
    }

    /**
     * @notice Explicitly assigns the OWNER role to a new user.
     * @dev Handled by backend during KYC/Registration via governance.
     */
    function assignOwner(address _user) external onlyGovernance {
        require(roles[_user] == Role.NONE, "NotaryRegistry: Already has a role");
        require(!isBanned[_user], "NotaryRegistry: User is banned");
        
        roles[_user] = Role.OWNER;
        emit RolePromoted(_user, Role.OWNER, block.timestamp);
    }

    /**
     * @notice Promotes an OWNER to a NOTARY.
     */
    function promoteToNotary(address _user) external onlyGovernance {
        require(roles[_user] == Role.OWNER, "NotaryRegistry: Must be an OWNER first");
        require(!isBanned[_user], "NotaryRegistry: User is banned");
        
        roles[_user] = Role.NOTARY;
        emit RolePromoted(_user, Role.NOTARY, block.timestamp);
    }

    /**
     * @notice Promotes a NOTARY to an ADMIN.
     */
    function promoteToAdmin(address _user) external onlyGovernance {
        require(roles[_user] == Role.NOTARY, "NotaryRegistry: Must be a NOTARY first");
        require(!isBanned[_user], "NotaryRegistry: User is banned");
        
        roles[_user] = Role.ADMIN;
        adminCount++;
        emit RolePromoted(_user, Role.ADMIN, block.timestamp);
    }

    /**
     * @notice Revokes all roles for an address.
     */
    function removeRole(address _user) external onlyGovernance {
        require(_user != multiSig, "NotaryRegistry: Cannot remove governance");
        
        Role currentRole = roles[_user];
        if (currentRole == Role.ADMIN) {
            require(adminCount > 1, "NotaryRegistry: Cannot remove last admin");
            adminCount--;
        }
        
        roles[_user] = Role.NONE;
        emit RoleRemoved(_user, block.timestamp);
    }

    /**
     * @notice Updates the ban status for a user.
     * @dev Banning blocks role promotion and notarization but doesn't remove roles.
     */
    function setBanStatus(address _user, bool _status) external onlyGovernance {
        isBanned[_user] = _status;
        emit UserBanned(_user, _status, block.timestamp);
    }

    /**
     * @notice Checks if an address is exactly a Notary.
     */
    function isNotary(address _user) external view returns (bool) {
        return uint8(roles[_user]) >= uint8(Role.NOTARY);
    }

    /**
     * @notice Checks if an address is an Admin.
     */
    function isAdmin(address _user) external view returns (bool) {
        return roles[_user] == Role.ADMIN;
    }

    /**
     * @notice Returns the role of a user.
     */
    function getUserRole(address _user) external view returns (Role) {
        return roles[_user];
    }
}
