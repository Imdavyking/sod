// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint64, ebool, externalEuint64, sharedEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IERC7984} from "fhenix-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CampaignInfo} from "./CampaignInfo.sol";

/// @title SodConfidentialCrowdfund
/// @notice Phase 2: same rules as SodCrowdfund, but donation amounts and the running total are
///         encrypted with Fhenix CoFHE. Donor addresses, the goal, the deadline and which
///         donations were refunded stay public. See the README privacy table.
///
/// @dev Design notes
///  - Funds are a confidential FHERC20 token (eUSDC). Donors must `setOperator(this, until)` on the token.
///  - The amount recorded is what the token actually moved, not what was requested. A donor who asks
///    for more than they hold silently moves 0 (FHERC20 zero-replacement), and 0 is recorded.
///  - The goal check is `FHE.gte(total, goal)`, an encrypted boolean. Nothing is decrypted on-chain:
///      creator payout = FHE.select(goalMet, total, 0)
///      donor refund   = FHE.select(goalMet, 0, donation)       (after the deadline)
///  - `total` is only reduced by refunds made BEFORE the deadline. After the deadline it is frozen, so
///    `goalMet` can never flip. This also means a creator withdrawal cannot block refunds on a failed
///    campaign, and a refund can never pull funds that belong to a paid-out campaign.
///  - A refund after the deadline on a funded campaign pays 0 and still marks the donation refunded.
///  - The owner can pause new campaigns and donations only. It cannot touch funds.
contract SodConfidentialCrowdfund is ReentrancyGuard, Pausable, Ownable, CampaignInfo {
    struct Campaign {
        address creator;
        uint64 goal; // public, in token units (6 decimals)
        uint64 deadline;
        bool withdrawn;
        uint256 donationCount;
        euint64 total; // encrypted; reduced only by refunds before the deadline
    }

    struct Donation {
        euint64 amount; // encrypted amount the token actually moved
        bytes32 commitment;
        bool refunded;
    }

    IERC7984 public immutable token;

    uint256 public campaignCount;
    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(uint256 => Donation)) private _donations;

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint64 goal, uint64 deadline);
    event Donated(uint256 indexed campaignId, uint256 indexed donationIndex, address indexed donor, bytes32 commitment);
    event Refunded(uint256 indexed campaignId, uint256 indexed donationIndex, address indexed refundTo);
    event Withdrawn(uint256 indexed campaignId, address indexed creator);

    error InvalidGoal();
    error InvalidDeadline();
    error InvalidCommitment();
    error UnknownCampaign();
    error UnknownDonation();
    error CampaignEnded();
    error CampaignNotEnded();
    error NotCreator();
    error AlreadyWithdrawn();
    error AlreadyRefunded();
    error CommitmentMismatch();
    error InvalidRefundTarget();

    constructor(IERC7984 token_, address initialOwner) Ownable(initialOwner) {
        token = token_;
    }

    // ---------------------------------------------------------------------
    // Campaign lifecycle
    // ---------------------------------------------------------------------

    /// @param name        required, up to MAX_NAME_BYTES
    /// @param description optional, up to MAX_DESCRIPTION_BYTES
    /// @param imageURI    optional https:// or ipfs:// link, up to MAX_IMAGE_URI_BYTES
    function createCampaign(
        string memory name,
        string memory description,
        string memory imageURI,
        uint64 goal,
        uint64 deadline
    ) external whenNotPaused returns (uint256 id) {
        if (goal == 0) revert InvalidGoal();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        id = campaignCount++;
        _setInfo(id, name, description, imageURI);
        Campaign storage c = _campaigns[id];
        c.creator = msg.sender;
        c.goal = goal;
        c.deadline = deadline;

        euint64 zero = FHE.asEuint64(0);
        FHE.allowThis(zero);
        c.total = zero;

        emit CampaignCreated(id, msg.sender, goal, deadline);
    }

    /// @notice Donate an encrypted amount before the deadline.
    /// @param encAmount encrypted input, bound to this contract by the client SDK
    /// @param proof     input proof returned by the client SDK
    /// @param commitment keccak256(abi.encode(campaignId, refundSecret, refundTo))
    /// @param viewer    optional extra address allowed to decrypt this donation amount. Use a plain EOA
    ///                  here when donating from a smart account, because CoFHE permits are EIP-712
    ///                  signatures (see README limitations). Pass address(0) to skip.
    function donate(
        uint256 id,
        externalEuint64 encAmount,
        bytes calldata proof,
        bytes32 commitment,
        address viewer
    ) external nonReentrant whenNotPaused returns (uint256 donationIndex) {
        Campaign storage c = _campaign(id);
        if (block.timestamp >= c.deadline) revert CampaignEnded();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        euint64 requested = FHE.asEuint64(encAmount, proof);

        // Pull the tokens. The token returns what it actually moved (0 if the donor lacked funds).
        sharedEuint64 moved = token.confidentialTransferFrom(
            msg.sender,
            address(this),
            FHE.shareEuint64(requested, address(token))
        );
        euint64 received = FHE.receiveEuint64FromCall(moved, address(token));

        donationIndex = c.donationCount++;

        FHE.allowThis(received);
        FHE.allow(received, msg.sender);
        if (viewer != address(0)) FHE.allow(received, viewer);
        _donations[id][donationIndex] = Donation({amount: received, commitment: commitment, refunded: false});

        euint64 newTotal = FHE.add(c.total, received);
        FHE.allowThis(newTotal);
        c.total = newTotal;

        emit Donated(id, donationIndex, msg.sender, commitment);
    }

    /// @notice Refund a donation by revealing its secret and destination.
    ///         Before the deadline: always pays the donation back and reduces the total.
    ///         After the deadline: pays the donation back only if the goal was missed (encrypted check).
    function refund(uint256 id, uint256 donationIndex, bytes32 secret, address refundTo) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (donationIndex >= c.donationCount) revert UnknownDonation();
        if (refundTo == address(0)) revert InvalidRefundTarget();

        Donation storage d = _donations[id][donationIndex];
        if (d.refunded) revert AlreadyRefunded();
        if (keccak256(abi.encode(id, secret, refundTo)) != d.commitment) revert CommitmentMismatch();

        // effects
        d.refunded = true;

        euint64 payout;
        if (block.timestamp < c.deadline) {
            payout = d.amount;
            euint64 newTotal = FHE.sub(c.total, payout);
            FHE.allowThis(newTotal);
            c.total = newTotal;
        } else {
            // total is frozen after the deadline, so this answer is stable
            ebool goalMet = FHE.gte(c.total, FHE.asEuint64(uint256(c.goal)));
            payout = FHE.select(goalMet, FHE.asEuint64(0), d.amount);
        }
        FHE.allowThis(payout);
        FHE.allow(payout, refundTo);

        // interactions
        token.confidentialTransfer(refundTo, FHE.shareEuint64(payout, address(token)));

        emit Refunded(id, donationIndex, refundTo);
    }

    /// @notice Creator collects the total once after the deadline. Pays 0 if the goal was missed.
    function withdraw(uint256 id) external nonReentrant {
        Campaign storage c = _campaign(id);
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.deadline) revert CampaignNotEnded();
        if (c.withdrawn) revert AlreadyWithdrawn();

        // effects
        c.withdrawn = true;

        ebool goalMet = FHE.gte(c.total, FHE.asEuint64(uint256(c.goal)));
        euint64 payout = FHE.select(goalMet, c.total, FHE.asEuint64(0));
        FHE.allowThis(payout);
        FHE.allow(payout, c.creator);

        // After settlement the creator may read the (frozen) total.
        FHE.allow(c.total, c.creator);

        // interactions
        token.confidentialTransfer(c.creator, FHE.shareEuint64(payout, address(token)));

        emit Withdrawn(id, c.creator);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function campaigns(uint256 id)
        external
        view
        returns (address creator, uint64 goal, uint64 deadline, bool withdrawn, uint256 donationCount)
    {
        Campaign storage c = _campaign(id);
        return (c.creator, c.goal, c.deadline, c.withdrawn, c.donationCount);
    }

    /// @notice Handle of the encrypted total. Only addresses granted access can decrypt it.
    function totalHandle(uint256 id) external view returns (euint64) {
        return _campaign(id).total;
    }

    function getDonation(uint256 id, uint256 donationIndex)
        external
        view
        returns (euint64 amount, bytes32 commitment, bool refunded)
    {
        Campaign storage c = _campaign(id);
        if (donationIndex >= c.donationCount) revert UnknownDonation();
        Donation storage d = _donations[id][donationIndex];
        return (d.amount, d.commitment, d.refunded);
    }

    function computeCommitment(uint256 id, bytes32 secret, address refundTo) external pure returns (bytes32) {
        return keccak256(abi.encode(id, secret, refundTo));
    }

    // ---------------------------------------------------------------------
    // Emergency controls (cannot touch campaign funds)
    // ---------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _campaign(uint256 id) private view returns (Campaign storage c) {
        if (id >= campaignCount) revert UnknownCampaign();
        c = _campaigns[id];
    }
}
