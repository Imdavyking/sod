// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHERC20} from "fhenix-confidential-contracts/contracts/FHERC20/FHERC20.sol";
import {FHERC20ERC20Wrapper} from "fhenix-confidential-contracts/contracts/FHERC20/extensions/FHERC20ERC20Wrapper.sol";

/// @notice Confidential (FHERC20) wrapper around a plain ERC-20 such as MockUSDG.
///         `shield` is public (it reveals how much was wrapped). Everything after that is encrypted.
/// @dev    Deploying this contract requires linking `ERC20ConfidentialLib` (see scripts/deploy.ts).
contract ConfidentialUSDG is FHERC20ERC20Wrapper {
    constructor(IERC20 underlying_)
        FHERC20("Confidential USDG", "eUSDG", 6, "")
        FHERC20ERC20Wrapper(underlying_)
    {}
}
