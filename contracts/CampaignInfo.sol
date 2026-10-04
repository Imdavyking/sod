// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CampaignInfo
/// @notice The human-facing part of a campaign: a name, a description and an image link.
///         Shared by the public and the confidential crowdfund so both enforce the same limits.
/// @dev    Text is stored on-chain (cheap enough on Arbitrum) so the campaign page needs no server and
///         cannot be edited later by anyone, including the creator. Images are NOT stored on-chain, only a
///         link (https:// or ipfs://). Prefer ipfs:// so the image does not depend on one web host.
///         Limits are in BYTES, not characters, because UTF-8 characters can take several bytes.
abstract contract CampaignInfo {
    struct Info {
        string name;
        string description;
        string imageURI;
    }

    uint256 public constant MAX_NAME_BYTES = 80;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2000;
    uint256 public constant MAX_IMAGE_URI_BYTES = 300;

    mapping(uint256 => Info) private _info;

    /// @dev Emitted with the full text so indexers (a subgraph, Dune) get it without reading storage.
    event CampaignInfoSet(uint256 indexed campaignId, string name, string description, string imageURI);

    error InvalidName();
    error DescriptionTooLong();
    error ImageURITooLong();

    function getCampaignInfo(uint256 id)
        external
        view
        returns (string memory name, string memory description, string memory imageURI)
    {
        Info storage i = _info[id];
        return (i.name, i.description, i.imageURI);
    }

    function _setInfo(uint256 id, string memory name, string memory description, string memory imageURI) internal {
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME_BYTES) revert InvalidName();
        if (bytes(description).length > MAX_DESCRIPTION_BYTES) revert DescriptionTooLong();
        if (bytes(imageURI).length > MAX_IMAGE_URI_BYTES) revert ImageURITooLong();

        _info[id] = Info({name: name, description: description, imageURI: imageURI});
        emit CampaignInfoSet(id, name, description, imageURI);
    }
}
