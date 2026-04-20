// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/IFregsRandomizer.sol";

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

    string public name = "FregSpinToken";
    string public symbol = "FREGSPIN";

    // External contracts
    IFregsMintPass public mintPassContract;
    IFregsItems public itemsContract;
    IFregsRandomizer public randomizer;

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

    // Item supply caps (0 = unlimited)
    mapping(uint256 => uint256) public itemMaxSupply;
    mapping(uint256 => uint256) public itemMintCount;

    struct PendingSpin {
        address player;
        bool active;
    }

    mapping(uint256 => PendingSpin) private pendingSpins;
    mapping(uint256 => uint256) public spinActionByRequestId;
    uint256 public nextSpinActionId;
    uint256 public pendingSpinCount;

    bool public active;

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
    event SpinRequested(uint256 indexed requestId, uint256 indexed actionId, address indexed player);

    modifier onlyRandomizer() {
        require(address(randomizer) != address(0) && msg.sender == address(randomizer), "Only randomizer");
        _;
    }

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    // ============ Spin the Wheel ============

    function spin() external nonReentrant {
        require(active, "Spin is not active");
        require(address(randomizer) != address(0), "Randomizer not set");
        require(balanceOf(msg.sender, SPIN_TOKEN) >= 1, "No SpinToken");
        require(address(mintPassContract) != address(0), "MintPass contract not set");
        require(address(itemsContract) != address(0), "Items contract not set");

        uint256 totalWeight = loseWeight + mintPassWeight + totalItemWeight;
        require(totalWeight > 0, "No prizes configured");

        uint256 actionId = ++nextSpinActionId;
        pendingSpins[actionId] = PendingSpin({player: msg.sender, active: true});

        // Burn 1 SpinToken
        _burn(msg.sender, SPIN_TOKEN, 1);
        emit CoinBurned(msg.sender, 1);

        pendingSpinCount += 1;
        uint256 requestId = randomizer.requestSpin(msg.sender, actionId);
        if (pendingSpins[actionId].active) {
            spinActionByRequestId[requestId] = actionId;
        }
        emit SpinRequested(requestId, actionId, msg.sender);
    }

    // Intentionally not nonReentrant so localhost mock VRF auto-fulfill can settle in the same tx.
    function fulfillSpin(uint256 requestId, uint256 actionId, address player, uint256 randomWord) external onlyRandomizer {
        PendingSpin memory pending = pendingSpins[actionId];
        require(pending.active, "Unknown spin request");
        require(pending.player == player, "Spin player mismatch");

        uint256 trackedActionId = spinActionByRequestId[requestId];
        require(trackedActionId == 0 || trackedActionId == actionId, "Spin request mismatch");

        delete pendingSpins[actionId];
        delete spinActionByRequestId[requestId];
        pendingSpinCount -= 1;

        uint256 totalWeight = loseWeight + mintPassWeight + totalItemWeight;
        uint256 rand = randomWord % totalWeight;
        uint256 cumulative = loseWeight;

        if (rand < cumulative) {
            emit SpinResult(player, false, PRIZE_NONE, 0);
            return;
        }

        cumulative += mintPassWeight;
        if (rand < cumulative) {
            mintPassContract.mintFromCoin(player, 1);
            emit SpinResult(player, true, PRIZE_MINTPASS, 0);
            return;
        }

        for (uint256 i = 0; i < itemPrizes.length; i++) {
            cumulative += itemPrizes[i].weight;
            if (rand < cumulative) {
                uint256 iType = itemPrizes[i].itemType;

                if (itemMaxSupply[iType] > 0 && itemMintCount[iType] >= itemMaxSupply[iType]) {
                    mintPassContract.mintFromCoin(player, 1);
                    emit SpinResult(player, true, PRIZE_MINTPASS, 0);
                    return;
                }

                itemMintCount[iType]++;
                itemsContract.mintFromCoin(player, iType);
                emit SpinResult(player, true, PRIZE_ITEM, iType);
                return;
            }
        }

        emit SpinResult(player, false, PRIZE_NONE, 0);
    }

    // ============ Owner Functions ============

    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

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
        require(pendingSpinCount == 0, "Spin requests pending");
        mintPassContract = IFregsMintPass(_mintPass);
    }

    function setItemsContract(address _items) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
        itemsContract = IFregsItems(_items);
    }

    function setRandomizer(address _randomizer) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
        randomizer = IFregsRandomizer(_randomizer);
    }

    function setLoseWeight(uint256 _weight) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
        loseWeight = _weight;
        emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
    }

    function setMintPassWeight(uint256 _weight) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
        mintPassWeight = _weight;
        emit WeightsUpdated(loseWeight, mintPassWeight, totalItemWeight);
    }

    function addItemPrize(uint256 itemType, uint256 weight) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
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
        require(pendingSpinCount == 0, "Spin requests pending");
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
        require(pendingSpinCount == 0, "Spin requests pending");
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

    function rescuePendingSpinCount(uint256) external pure {
        revert("Use request-specific rescue");
    }

    function rescuePendingSpins(uint256[] calldata requestIds) external onlyOwner {
        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            uint256 actionId = spinActionByRequestId[requestId];
            require(actionId != 0, "Unknown spin request");

            PendingSpin memory pending = pendingSpins[actionId];
            require(pending.active, "Spin not pending");

            delete pendingSpins[actionId];
            delete spinActionByRequestId[requestId];
            pendingSpinCount -= 1;

            randomizer.cancelRequest(requestId);
            _mint(pending.player, SPIN_TOKEN, 1, "");
            emit CoinsMinted(pending.player, 1);
        }
    }

    function setItemMaxSupply(uint256 itemType, uint256 maxSupply) external onlyOwner {
        require(pendingSpinCount == 0, "Spin requests pending");
        itemMaxSupply[itemType] = maxSupply;
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

    function getRemainingItemSupply(uint256 itemType) external view returns (uint256) {
        if (itemMaxSupply[itemType] == 0) return type(uint256).max;
        return itemMaxSupply[itemType] - itemMintCount[itemType];
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
            '{"name": "Freg Spin Token",',
            '"description": "Spin the wheel for a chance to win prizes! Burn 1 SpinToken to spin.",',
            '"image": "ipfs://bafybeidvpudkt75b56scxtnwtm2fmpodf5a7jslcmhmlh25vl6elmlw6cq",',
            '"animation_url": "ipfs://bafybeiaufjnxtaa4gkc6qouifr2mi7r6d44lbhwhpis2ygck6octup46ue",',
            '"attributes": [{"trait_type": "Type", "value": "Spin Token"}]}'
        );
        return _base64Encode(json);
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
