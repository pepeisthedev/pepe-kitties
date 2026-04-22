// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IFregsItemsShop {
    function mintFromShop(address to, uint256 _itemType) external;
}

contract FregShop is Ownable, ReentrancyGuard {
    IERC20 public fregCoin;
    IFregsItemsShop public itemsContract;
    address public fregCoinContract;

    struct ShopItem {
        uint256 price;
        bool isActive;
        uint256 maxSupply;
        uint256 mintCount;
    }

    bool public shopActive;

    mapping(uint256 => ShopItem) public shopItems;
    uint256[] public listedItemTypes;

    event ItemListed(uint256 indexed itemTypeId, uint256 price, uint256 maxSupply);
    event ItemUpdated(uint256 indexed itemTypeId, uint256 price, bool isActive, uint256 maxSupply);
    event ItemDelisted(uint256 indexed itemTypeId);
    event ItemPurchased(address indexed buyer, uint256 indexed itemTypeId, uint256 price);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function buyItem(
        uint256 itemTypeId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(shopActive, "Shop is not active");

        ShopItem storage item = shopItems[itemTypeId];
        require(item.isActive, "Item not for sale");
        require(item.price > 0, "Item not configured");
        require(item.maxSupply == 0 || item.mintCount < item.maxSupply, "Sold out");

        uint256 price = item.price;
        item.mintCount += 1;

        IERC20Permit(fregCoinContract).permit(msg.sender, address(this), price, deadline, v, r, s);
        fregCoin.transferFrom(msg.sender, address(this), price);
        itemsContract.mintFromShop(msg.sender, itemTypeId);

        emit ItemPurchased(msg.sender, itemTypeId, price);
    }

    function getPrice(uint256 itemTypeId) external view returns (uint256) {
        ShopItem storage item = shopItems[itemTypeId];
        require(item.isActive, "Item not for sale");
        require(item.price > 0, "Item not configured");
        return item.price;
    }

    function listItem(uint256 itemTypeId, uint256 price, uint256 maxSupply) external onlyOwner {
        require(price > 0, "Price must be > 0");
        require(itemTypeId >= 101, "Only dynamic items");
        require(!shopItems[itemTypeId].isActive, "Already listed");

        shopItems[itemTypeId] = ShopItem({
            price: price,
            isActive: true,
            maxSupply: maxSupply,
            mintCount: 0
        });
        listedItemTypes.push(itemTypeId);

        emit ItemListed(itemTypeId, price, maxSupply);
    }

    function updateItem(uint256 itemTypeId, uint256 price, bool isActive, uint256 maxSupply) external onlyOwner {
        require(shopItems[itemTypeId].price > 0, "Item not listed");
        require(price > 0, "Price must be > 0");

        shopItems[itemTypeId].price = price;
        shopItems[itemTypeId].isActive = isActive;
        shopItems[itemTypeId].maxSupply = maxSupply;

        emit ItemUpdated(itemTypeId, price, isActive, maxSupply);
    }

    function delistItem(uint256 itemTypeId) external onlyOwner {
        require(shopItems[itemTypeId].price > 0, "Item not listed");
        shopItems[itemTypeId].isActive = false;

        emit ItemDelisted(itemTypeId);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = fregCoin.balanceOf(address(this));
        require(amount <= balance, "Insufficient balance");
        fregCoin.transfer(to, amount);

        emit Withdrawn(to, amount);
    }

    function getListedItems() external view returns (
        uint256[] memory itemTypeIds,
        uint256[] memory prices,
        bool[] memory actives,
        uint256[] memory maxSupplies,
        uint256[] memory mintCounts
    ) {
        uint256 len = listedItemTypes.length;
        itemTypeIds = new uint256[](len);
        prices = new uint256[](len);
        actives = new bool[](len);
        maxSupplies = new uint256[](len);
        mintCounts = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            uint256 typeId = listedItemTypes[i];
            ShopItem storage item = shopItems[typeId];
            itemTypeIds[i] = typeId;
            prices[i] = item.price;
            actives[i] = item.isActive;
            maxSupplies[i] = item.maxSupply;
            mintCounts[i] = item.mintCount;
        }
    }

    function getListedItemCount() external view returns (uint256) {
        return listedItemTypes.length;
    }

    function setShopActive(bool _active) external onlyOwner {
        shopActive = _active;
    }

    function setFregCoinContract(address _fregCoin) external onlyOwner {
        require(_fregCoin != address(0), "Invalid address");
        fregCoinContract = _fregCoin;
        fregCoin = IERC20(_fregCoin);
    }

    function setItemsContract(address _items) external onlyOwner {
        require(_items != address(0), "Invalid address");
        itemsContract = IFregsItemsShop(_items);
    }
}
