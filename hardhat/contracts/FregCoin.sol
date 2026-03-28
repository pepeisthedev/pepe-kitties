// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract FregCoin is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant MAX_SUPPLY = 1_337_000_000_000 * 10 ** 18;

    constructor() ERC20("FregCoin", "FREG") ERC20Permit("FregCoin") {
        _mint(msg.sender, MAX_SUPPLY);
    }
}
