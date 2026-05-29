// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockCusd
 * @notice ERC-20 test token that mimics cUSD on Celo Sepolia.
 *         The deployer (platform wallet) is the owner and can mint
 *         unlimited tokens for testing.
 *
 * @dev Uses OpenZeppelin ERC20 + Ownable — no custom logic beyond mint().
 *       Decimals = 18 (matches real cUSD).
 */
contract MockCusd is ERC20, Ownable {
    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _name   Token name (e.g. "Celo Dollar")
     * @param _symbol Token symbol (e.g. "cUSD")
     */
    constructor(
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) Ownable(msg.sender) {}

    // -----------------------------------------------------------------------
    // Mint (owner only)
    // -----------------------------------------------------------------------

    /**
     * @notice Mint `_amount` tokens to `_to` address.
     * @dev    Only callable by the contract owner (platform wallet).
     *
     * @param _to     Recipient address
     * @param _amount Amount in wei (18 decimals)
     */
    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }
}
