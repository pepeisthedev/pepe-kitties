// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IFregsMintPass {
    function mintFromCoin(address to, uint256 amount) external;
}

interface IFregsItems {
    function mintFromCoin(address to, uint256 _itemType) external;
}

contract SpinTheWheel is ERC1155, ERC1155Burnable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // Token ID for the SpinToken (ERC1155 single token type)
    uint256 public constant SPIN_TOKEN = 1;

    string public name = "SpinToken";
    string public symbol = "SPIN";

    // External contracts
    IFregsMintPass public mintPassContract;
    IFregsItems public itemsContract;

    // Prize types
    uint256 public constant PRIZE_NONE = 0;       // Lose
    uint256 public constant PRIZE_MINTPASS = 1;   // Win a MintPass
    uint256 public constant PRIZE_ITEM = 2;       // Win an item

    // Prize weights (out of 10000)
    uint256 public loseWeight = 8000;             // 80% chance to lose
    uint256 public mintPassWeight = 1000;         // 10% chance to win MintPass

    // Item prizes (itemType => weight)
    struct ItemPrize {
        uint256 itemType;
        uint256 weight;
    }
    ItemPrize[] public itemPrizes;
    uint256 public totalItemWeight;

    // Randomness
    uint256 private randomNonce;

    // Events
    event SpinResult(
        address indexed player,
        bool won,
        uint256 prizeType,
        uint256 itemType
    );
    event CoinBurned(address indexed player, uint256 amount);
    event CoinsMinted(address indexed to, uint256 amount);
    event ItemPrizeAdded(uint256 itemType, uint256 weight);
    event ItemPrizeRemoved(uint256 itemType);
    event WeightsUpdated(uint256 loseWeight, uint256 mintPassWeight, uint256 totalItemWeight);

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    // ============ Spin the Wheel ============

    function spin() external nonReentrant {
        require(balanceOf(msg.sender, SPIN_TOKEN) >= 1, "No SpinToken");
        require(address(mintPassContract) != address(0), "MintPass contract not set");
        require(address(itemsContract) != address(0), "Items contract not set");

        // Burn 1 SpinToken
        _burn(msg.sender, SPIN_TOKEN, 1);
        emit CoinBurned(msg.sender, 1);

        // Calculate total weight
        uint256 totalWeight = loseWeight + mintPassWeight + totalItemWeight;
        require(totalWeight > 0, "No prizes configured");

        // Get random number
        uint256 rand = _getRandom(totalWeight);
        uint256 cumulative = 0;

        // Check for lose
        cumulative += loseWeight;
        if (rand < cumulative) {
            emit SpinResult(msg.sender, false, PRIZE_NONE, 0);
            return;
        }

        // Check for MintPass
        cumulative += mintPassWeight;
        if (rand < cumulative) {
            mintPassContract.mintFromCoin(msg.sender, 1);
            emit SpinResult(msg.sender, true, PRIZE_MINTPASS, 0);
            return;
        }

        // Check for item prizes
        for (uint256 i = 0; i < itemPrizes.length; i++) {
            cumulative += itemPrizes[i].weight;
            if (rand < cumulative) {
                itemsContract.mintFromCoin(msg.sender, itemPrizes[i].itemType);
                emit SpinResult(msg.sender, true, PRIZE_ITEM, itemPrizes[i].itemType);
                return;
            }
        }

        // Fallback: lose (should never reach here if weights are configured correctly)
        emit SpinResult(msg.sender, false, PRIZE_NONE, 0);
    }

    function _getRandom(uint256 max) internal returns (uint256) {
        randomNonce++;
        return uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    randomNonce
                )
            )
        ) % max;
    }

    // ============ Owner Functions ============

    function ownerMint(address to, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        _mint(to, SPIN_TOKEN, amount, "");
        emit CoinsMinted(to, amount);
    }

    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(amounts[i] > 0, "Amount must be greater than 0");
            _mint(recipients[i], SPIN_TOKEN, amounts[i], "");
            emit CoinsMinted(recipients[i], amounts[i]);
        }
    }

    // Simple airdrop: 1 SpinToken to each address
    function airdropOne(address[] calldata recipients) external onlyOwner {
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], SPIN_TOKEN, 1, "");
            emit CoinsMinted(recipients[i], 1);
        }
    }

    function setMintPassContract(address _mintPass) external onlyOwner {
        mintPassContract = IFregsMintPass(_mintPass);
    }

    function setItemsContract(address _items) external onlyOwner {
        itemsContract = IFregsItems(_items);
    }

    function setLoseWeight(uint256 _weight) external onlyOwner {
        loseWeight = _weight;
        emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
    }

    function setMintPassWeight(uint256 _weight) external onlyOwner {
        mintPassWeight = _weight;
        emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
    }

    function addItemPrize(uint256 itemType, uint256 weight) external onlyOwner {
        require(weight > 0, "Weight must be greater than 0");

        // Check if item type already exists
        for (uint256 i = 0; i < itemPrizes.length; i++) {
            require(itemPrizes[i].itemType != itemType, "Item type already exists");
        }

        itemPrizes.push(ItemPrize({
            itemType: itemType,
            weight: weight
        }));
        totalItemWeight += weight;

        emit ItemPrizeAdded(itemType, weight);
        emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
    }

    function updateItemPrizeWeight(uint256 itemType, uint256 newWeight) external onlyOwner {
        for (uint256 i = 0; i < itemPrizes.length; i++) {
            if (itemPrizes[i].itemType == itemType) {
                totalItemWeight = totalItemWeight - itemPrizes[i].weight + newWeight;
                itemPrizes[i].weight = newWeight;
                emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
                return;
            }
        }
        revert("Item type not found");
    }

    function removeItemPrize(uint256 itemType) external onlyOwner {
        for (uint256 i = 0; i < itemPrizes.length; i++) {
            if (itemPrizes[i].itemType == itemType) {
                totalItemWeight -= itemPrizes[i].weight;

                // Move last element to removed position and pop
                itemPrizes[i] = itemPrizes[itemPrizes.length - 1];
                itemPrizes.pop();

                emit ItemPrizeRemoved(itemType);
                emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
                return;
            }
        }
        revert("Item type not found");
    }

    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }

    // ============ View Functions ============

    function getItemPrizesCount() external view returns (uint256) {
        return itemPrizes.length;
    }

    function getItemPrize(uint256 index) external view returns (uint256 itemType, uint256 weight) {
        require(index < itemPrizes.length, "Index out of bounds");
        return (itemPrizes[index].itemType, itemPrizes[index].weight);
    }

    function getAllItemPrizes() external view returns (uint256[] memory itemTypes, uint256[] memory weights) {
        itemTypes = new uint256[](itemPrizes.length);
        weights = new uint256[](itemPrizes.length);

        for (uint256 i = 0; i < itemPrizes.length; i++) {
            itemTypes[i] = itemPrizes[i].itemType;
            weights[i] = itemPrizes[i].weight;
        }

        return (itemTypes, weights);
    }

    function getTotalWeight() external view returns (uint256) {
        return loseWeight + mintPassWeight + totalItemWeight;
    }

    function getWinChance() external view returns (uint256) {
        uint256 totalWeight = loseWeight + mintPassWeight + totalItemWeight;
        if (totalWeight == 0) return 0;
        return ((mintPassWeight + totalItemWeight) * 10000) / totalWeight;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId == SPIN_TOKEN, "Invalid token ID");

        string memory baseUri = super.uri(tokenId);
        if (bytes(baseUri).length > 0) {
            return baseUri;
        }

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                _encodeMetadata()
            )
        );
    }

    function _encodeMetadata() internal pure returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name": "SpinToken",',
            '"description": "Spin the wheel for a chance to win prizes! Burn 1 SpinToken to spin.",',
            '"image": "data:image/svg+xml;base64,',
            _encodeCoinSVG(),
            '","attributes": [{"trait_type": "Type", "value": "Game Token"}]}'
        );
        return _base64Encode(json);
    }

    function _encodeCoinSVG() internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
            '<defs><linearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" style="stop-color:#FFD700"/>',
            '<stop offset="50%" style="stop-color:#FFA500"/>',
            '<stop offset="100%" style="stop-color:#FFD700"/>',
            '</linearGradient></defs>',
            '<circle cx="100" cy="100" r="90" fill="url(#coinGrad)" stroke="#B8860B" stroke-width="5"/>',
            '<circle cx="100" cy="100" r="70" fill="none" stroke="#B8860B" stroke-width="2"/>',
            '<text x="100" y="90" text-anchor="middle" fill="#8B4513" font-size="24" font-weight="bold">SPIN</text>',
            '<text x="100" y="120" text-anchor="middle" fill="#8B4513" font-size="18">TOKEN</text>',
            '</svg>'
        );
        return _base64Encode(svg);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i = 0;
        uint256 j = 0;

        while (i < len) {
            uint256 a = uint256(uint8(data[i++]));
            uint256 b = i < len ? uint256(uint8(data[i++])) : 0;
            uint256 c = i < len ? uint256(uint8(data[i++])) : 0;

            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = TABLE[(triple >> 6) & 0x3F];
            result[j++] = TABLE[triple & 0x3F];
        }

        if (len % 3 == 1) {
            result[encodedLen - 1] = "=";
            result[encodedLen - 2] = "=";
        } else if (len % 3 == 2) {
            result[encodedLen - 1] = "=";
        }

        return string(result);
    }
}
