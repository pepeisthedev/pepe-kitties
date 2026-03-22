// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFregShop {
    function getPrice(uint256 itemTypeId) external view returns (uint256);
    function buyItem(address buyer, uint256 itemTypeId) external;
}

contract FregCoin is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 1_337_000_000_000 * 10 ** 18;

    IFregShop public shopContract;

    constructor() ERC20("FregCoin", "FREG") Ownable(msg.sender) {
        _mint(msg.sender, MAX_SUPPLY);
    }

    function buyItem(uint256 itemTypeId) external nonReentrant {
        require(address(shopContract) != address(0), "Shop not set");
        uint256 price = shopContract.getPrice(itemTypeId);
        require(balanceOf(msg.sender) >= price, "Insufficient FREG");
        _transfer(msg.sender, address(shopContract), price);
        shopContract.buyItem(msg.sender, itemTypeId);
    }

    function setShopContract(address _shop) external onlyOwner {
        shopContract = IFregShop(_shop);
    }
}
