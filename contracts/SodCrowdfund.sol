// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CampaignInfo} from "./CampaignInfo.sol";

/// @title SodCrowdfund
/// @notice Trustless crowdfunding escrow. The contract, not a company, enforces the goal,
///         the deadline and refunds. Phase 1: fully public amounts.
/// @dev    Refunds are bound to a donor secret AND a destination address via a commitment:
///         commitment = keccak256(abi.encode(campaignId, refundSecret, refundTo))
///         so a secret copied from the mempool cannot redirect a refund.
///
///         The owner can only pause NEW campaigns and donations. The owner has no path to
///         campaign funds, and refund/withdraw stay available while paused.
contract SodCrowdfund is ReentrancyGuard, Pausable, Ownable, CampaignInfo {
    using SafeERC20 for IERC20;

    struct Campaign {
        address creator;
        uint256 goal;
        uint64 deadline;
        bool withdrawn;
        uint256 total; // sum of unrefunded donations
        uint256 donationCount;
    }

    struct Donation {
        uint256 amount;
        bytes32 commitment;
        bool refunded;
    }

    IERC20 public immutable token;

    uint256 public campaignCount;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(uint256 => Donation)) private _donations;

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint256 goal, uint64 deadline);
    event Donated(uint256 indexed campaignId, uint256 indexed donationIndex, uint256 amount, bytes32 commitment);
    event Refunded(uint256 indexed campaignId, uint256 indexed donationIndex, address indexed refundTo, uint256 amount);
    event Withdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);

    error InvalidGoal();
    error InvalidDeadline();
    error InvalidAmount();
    error InvalidCommitment();
    error UnknownCampaign();
    error UnknownDonation();
    error CampaignEnded();
    error CampaignNotEnded();
    error GoalNotMet();
    error GoalMet();
    error NotCreator();
    error AlreadyWithdrawn();
    error AlreadyRefunded();
    error CommitmentMismatch();
    error InvalidRefundTarget();

    constructor(IERC20 token_, address initialOwner) Ownable(initialOwner) {
        token = token_;
    }

    // ---------------------------------------------------------------------
    // Campaign lifecycle
    // ---------------------------------------------------------------------

    /// @notice Start a campaign. `deadline` is a unix timestamp that must be in the future.
    /// @param name        required, up to MAX_NAME_BYTES
    /// @param description optional, up to MAX_DESCRIPTION_BYTES
    /// @param imageURI    optional https:// or ipfs:// link, up to MAX_IMAGE_URI_BYTES
    function createCampaign(
        string memory name,
        string memory description,
        string memory imageURI,
        uint256 goal,
        uint64 deadline
    ) external whenNotPaused returns (uint256 id) {
        if (goal == 0) revert InvalidGoal();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        id = campaignCount++;
        _setInfo(id, name, description, imageURI);
        campaigns[id] = Campaign({
            creator: msg.sender,
            goal: goal,
            deadline: deadline,
            withdrawn: false,
            total: 0,
            donationCount: 0
        });

        emit CampaignCreated(id, msg.sender, goal, deadline);
    }

    /// @notice Donate to a campaign before its deadline.
    /// @param commitment keccak256(abi.encode(campaignId, refundSecret, refundTo))
    function donate(uint256 id, uint256 amount, bytes32 commitment)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 donationIndex)
    {
        Campaign storage c = _campaign(id);
        if (block.timestamp >= c.deadline) revert CampaignEnded();
        if (amount == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        donationIndex = c.donationCount++;
        _donations[id][donationIndex] = Donation({amount: amount, commitment: commitment, refunded: false});
        c.total += amount;

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Donated(id, donationIndex, amount, commitment);
    }

    /// @notice Refund a donation by revealing its secret and destination.
    ///         Allowed before the deadline, or after the deadline if the goal was not met.
    ///         Callable by anyone who holds the secret; funds only ever go to `refundTo`,
    ///         which is bound into the commitment.
    function refund(uint256 id, uint256 donationIndex, bytes32 secret, address refundTo) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (donationIndex >= c.donationCount) revert UnknownDonation();
        if (refundTo == address(0)) revert InvalidRefundTarget();

        // After the deadline refunds are only open when the goal failed.
        if (block.timestamp >= c.deadline && c.total >= c.goal) revert GoalMet();

        Donation storage d = _donations[id][donationIndex];
        if (d.refunded) revert AlreadyRefunded();
        if (keccak256(abi.encode(id, secret, refundTo)) != d.commitment) revert CommitmentMismatch();

        uint256 amount = d.amount;

        // effects
        d.refunded = true;
        c.total -= amount;

        // interactions
        token.safeTransfer(refundTo, amount);

        emit Refunded(id, donationIndex, refundTo, amount);
    }

    /// @notice Creator collects the full total once, after the deadline, if the goal was met.
    function withdraw(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.deadline) revert CampaignNotEnded();
        if (c.withdrawn) revert AlreadyWithdrawn();
        if (c.total < c.goal) revert GoalNotMet();

        uint256 amount = c.total;

        // effects
        c.withdrawn = true;

        // interactions
        token.safeTransfer(c.creator, amount);

        emit Withdrawn(id, c.creator, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getDonation(uint256 id, uint256 donationIndex)
        external
        view
        returns (uint256 amount, bytes32 commitment, bool refunded)
    {
        Campaign storage c = _campaign(id);
        if (donationIndex >= c.donationCount) revert UnknownDonation();
        Donation storage d = _donations[id][donationIndex];
        return (d.amount, d.commitment, d.refunded);
    }

    /// @notice Helper so clients and tests compute the commitment exactly as the contract does.
    function computeCommitment(uint256 id, bytes32 secret, address refundTo) external pure returns (bytes32) {
        return keccak256(abi.encode(id, secret, refundTo));
    }

    // ---------------------------------------------------------------------
    // Emergency controls (cannot touch campaign funds)
    // ---------------------------------------------------------------------

    /// @notice Stops new campaigns and donations. Refunds and withdrawals keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _campaign(uint256 id) private view returns (Campaign storage c) {
        if (id >= campaignCount) revert UnknownCampaign();
        c = campaigns[id];
    }
}
