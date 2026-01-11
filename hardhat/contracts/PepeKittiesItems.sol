// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IPepeKitties {
    function ownerOf(uint256 tokenId) external view returns (address);
    function rerollHead(uint256 tokenId, address sender) external;
    function setSpecialSkin(uint256 tokenId, uint256 _specialSkin, address sender) external;
    function setBodyColor(uint256 tokenId, string memory _color, address sender) external;
    function totalMinted() external view returns (uint256);
}

interface ISVGItemsRenderer {
    function render(uint256 _itemType) external view returns (string memory);
}

contract PepeKittiesItems is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    // Item type constants
    uint256 public constant COLOR_CHANGE = 1;   // Most common - change body color
    uint256 public constant HEAD_REROLL = 2;
    uint256 public constant BRONZE_SKIN = 3;
    uint256 public constant SILVER_SKIN = 4;
    uint256 public constant GOLD_SKIN = 5;
    uint256 public constant TREASURE_CHEST = 6;

    IPepeKitties public pepeKitties;
    ISVGItemsRenderer public svgRenderer;

    uint256 private _tokenIdCounter;
    uint256 private randomNonce;

    // Track which kitties have claimed items
    mapping(uint256 => bool) public hasClaimed;

    // Item type for each token
    mapping(uint256 => uint256) public itemType;

    // Treasure chest tracking
    uint256 public treasureChestCount;
    uint256 public constant MAX_TREASURE_CHESTS = 5;
    uint256 public chestETHAmount = 0.1 ether;

    // Rarity weights (out of 10000)
    uint256 public colorChangeWeight = 4000;  // 40% - most common
    uint256 public headRerollWeight = 3000;   // 30%
    uint256 public bronzeSkinWeight = 1500;   // 15%
    uint256 public silverSkinWeight = 1000;   // 10%
    uint256 public goldSkinWeight = 500;      // 5%

    // Events
    event ItemClaimed(
        uint256 indexed kittyId,
        uint256 indexed itemTokenId,
        address indexed owner,
        uint256 itemType
    );

    event ColorChangeUsed(
        uint256 indexed itemTokenId,
        uint256 indexed kittyId,
        address indexed owner,
        string newColor
    );

    event HeadRerollUsed(
        uint256 indexed itemTokenId,
        uint256 indexed kittyId,
        address indexed owner
    );

    event SpecialSkinItemUsed(
        uint256 indexed itemTokenId,
        uint256 indexed kittyId,
        address indexed owner,
        uint256 specialSkin
    );

    event TreasureChestMinted(
        uint256 indexed itemTokenId,
        address indexed owner
    );

    event TreasureChestBurned(
        uint256 indexed itemTokenId,
        address indexed owner,
        uint256 ethAmount
    );

    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_,
        address _pepeKitties
    )
        ERC721AC(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
        Ownable(address(msg.sender))
    {
        pepeKitties = IPepeKitties(_pepeKitties);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "data:application/json;base64,";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");

        string memory itemName = _getItemName(itemType[tokenId]);
        string memory itemDescription = _getItemDescription(itemType[tokenId]);

        string memory svg;
        if (address(svgRenderer) != address(0)) {
            svg = svgRenderer.render(itemType[tokenId]);
        } else {
            svg = _getPlaceholderSVG(itemType[tokenId]);
        }

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "',
                        itemName,
                        ' #',
                        Strings.toString(tokenId),
                        '","description": "',
                        itemDescription,
                        '","image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '","attributes": [{"trait_type": "Item Type","value": "',
                        itemName,
                        '"}]}'
                    )
                )
            )
        );

        return string(abi.encodePacked(_baseURI(), json));
    }

    function _getItemName(uint256 _itemType) internal pure returns (string memory) {
        if (_itemType == COLOR_CHANGE) return "Color Change";
        if (_itemType == HEAD_REROLL) return "Head Reroll";
        if (_itemType == BRONZE_SKIN) return "Bronze Skin";
        if (_itemType == SILVER_SKIN) return "Silver Skin";
        if (_itemType == GOLD_SKIN) return "Gold Skin";
        if (_itemType == TREASURE_CHEST) return "Treasure Chest";
        return "Unknown";
    }

    function _getItemDescription(uint256 _itemType) internal pure returns (string memory) {
        if (_itemType == COLOR_CHANGE) return "Change your Pepe Kitty's body color to any hex color";
        if (_itemType == HEAD_REROLL) return "Use this item to reroll your Pepe Kitty's head trait";
        if (_itemType == BRONZE_SKIN) return "Apply a bronze skin to your Pepe Kitty";
        if (_itemType == SILVER_SKIN) return "Apply a silver skin to your Pepe Kitty";
        if (_itemType == GOLD_SKIN) return "Apply a golden skin to your Pepe Kitty";
        if (_itemType == TREASURE_CHEST) return "Burn this chest to claim ETH rewards";
        return "Unknown item";
    }

    function _getPlaceholderSVG(uint256 _itemType) internal pure returns (string memory) {
        string memory color;
        if (_itemType == COLOR_CHANGE) color = "#ff6b6b";
        else if (_itemType == HEAD_REROLL) color = "#9333ea";
        else if (_itemType == BRONZE_SKIN) color = "#cd7f32";
        else if (_itemType == SILVER_SKIN) color = "#c0c0c0";
        else if (_itemType == GOLD_SKIN) color = "#ffd700";
        else if (_itemType == TREASURE_CHEST) color = "#8b4513";
        else color = "#666666";

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
                '<rect width="100" height="100" fill="',
                color,
                '"/>',
                '<text x="50" y="55" text-anchor="middle" fill="white" font-size="12">',
                _getItemName(_itemType),
                '</text></svg>'
            )
        );
    }

    // ============ Claim Item ============

    function claimItem(uint256 kittyId) external nonReentrant {
        require(pepeKitties.ownerOf(kittyId) == msg.sender, "Not kitty owner");
        require(!hasClaimed[kittyId], "Already claimed");

        hasClaimed[kittyId] = true;

        // Determine item type based on weighted random
        uint256 rand = _getRandom(10000);
        uint256 newItemType;
        uint256 cumulative = 0;

        cumulative += colorChangeWeight;
        if (rand < cumulative) {
            newItemType = COLOR_CHANGE;
        } else {
            cumulative += headRerollWeight;
            if (rand < cumulative) {
                newItemType = HEAD_REROLL;
            } else {
                cumulative += bronzeSkinWeight;
                if (rand < cumulative) {
                    newItemType = BRONZE_SKIN;
                } else {
                    cumulative += silverSkinWeight;
                    if (rand < cumulative) {
                        newItemType = SILVER_SKIN;
                    } else {
                        newItemType = GOLD_SKIN;
                    }
                }
            }
        }

        uint256 newItemId = _tokenIdCounter;
        _safeMint(msg.sender, 1);
        _tokenIdCounter += 1;
        itemType[newItemId] = newItemType;

        emit ItemClaimed(kittyId, newItemId, msg.sender, newItemType);
    }

    function _getRandom(uint256 max) internal returns (uint256) {
        randomNonce++;
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        msg.sender,
                        randomNonce,
                        _tokenIdCounter
                    )
                )
            ) % max;
    }

    // ============ Use Items ============

    function useColorChange(uint256 itemTokenId, uint256 kittyId, string memory newColor) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(itemType[itemTokenId] == COLOR_CHANGE, "Not a color change item");
        require(pepeKitties.ownerOf(kittyId) == msg.sender, "Not kitty owner");

        _burn(itemTokenId);
        pepeKitties.setBodyColor(kittyId, newColor, msg.sender);

        emit ColorChangeUsed(itemTokenId, kittyId, msg.sender, newColor);
    }

    function useHeadReroll(uint256 itemTokenId, uint256 kittyId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(itemType[itemTokenId] == HEAD_REROLL, "Not a head reroll item");
        require(pepeKitties.ownerOf(kittyId) == msg.sender, "Not kitty owner");

        _burn(itemTokenId);
        pepeKitties.rerollHead(kittyId, msg.sender);

        emit HeadRerollUsed(itemTokenId, kittyId, msg.sender);
    }

    function useSpecialSkinItem(uint256 itemTokenId, uint256 kittyId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(pepeKitties.ownerOf(kittyId) == msg.sender, "Not kitty owner");

        uint256 iType = itemType[itemTokenId];
        require(
            iType == BRONZE_SKIN || iType == SILVER_SKIN || iType == GOLD_SKIN,
            "Not a special skin item"
        );

        // Determine special skin type (1=bronze, 2=silver, 3=gold)
        uint256 specialSkinValue;
        if (iType == BRONZE_SKIN) specialSkinValue = 1;
        else if (iType == SILVER_SKIN) specialSkinValue = 2;
        else specialSkinValue = 3; // GOLD_SKIN

        _burn(itemTokenId);
        pepeKitties.setSpecialSkin(kittyId, specialSkinValue, msg.sender);

        emit SpecialSkinItemUsed(itemTokenId, kittyId, msg.sender, specialSkinValue);

        // If gold skin, also mint a treasure chest
        if (iType == GOLD_SKIN && treasureChestCount < MAX_TREASURE_CHESTS) {
            uint256 chestId = _tokenIdCounter;
            _safeMint(msg.sender, 1);
            _tokenIdCounter += 1;
            itemType[chestId] = TREASURE_CHEST;
            treasureChestCount += 1;

            emit TreasureChestMinted(chestId, msg.sender);
        }
    }

    function burnChest(uint256 chestTokenId) external nonReentrant {
        require(ownerOf(chestTokenId) == msg.sender, "Not chest owner");
        require(itemType[chestTokenId] == TREASURE_CHEST, "Not a treasure chest");
        require(address(this).balance >= chestETHAmount, "Insufficient contract balance");

        _burn(chestTokenId);
        treasureChestCount -= 1;

        payable(msg.sender).transfer(chestETHAmount);

        emit TreasureChestBurned(chestTokenId, msg.sender, chestETHAmount);
    }

    // ============ Owner Functions ============

    function setPepeKitties(address _pepeKitties) external onlyOwner {
        pepeKitties = IPepeKitties(_pepeKitties);
    }

    function setSVGRenderer(address _svgRenderer) external onlyOwner {
        svgRenderer = ISVGItemsRenderer(_svgRenderer);
    }

    function setChestETHAmount(uint256 _amount) external onlyOwner {
        chestETHAmount = _amount;
    }

    function setRarityWeights(
        uint256 _colorChange,
        uint256 _headReroll,
        uint256 _bronze,
        uint256 _silver,
        uint256 _gold
    ) external onlyOwner {
        require(
            _colorChange + _headReroll + _bronze + _silver + _gold == 10000,
            "Weights must sum to 10000"
        );
        colorChangeWeight = _colorChange;
        headRerollWeight = _headReroll;
        bronzeSkinWeight = _bronze;
        silverSkinWeight = _silver;
        goldSkinWeight = _gold;
    }

    function withdrawExcess() external onlyOwner {
        uint256 reserved = treasureChestCount * chestETHAmount;
        require(address(this).balance > reserved, "No excess funds");
        payable(owner()).transfer(address(this).balance - reserved);
    }

    function depositETH() external payable onlyOwner {}

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getItemInfo(uint256 itemTokenId)
        external
        view
        returns (uint256 _itemType, string memory _name)
    {
        require(_exists(itemTokenId), "Token does not exist");
        _itemType = itemType[itemTokenId];
        _name = _getItemName(_itemType);
    }

    function getOwnedItems(address owner)
        external
        view
        returns (uint256[] memory tokenIds, uint256[] memory types)
    {
        uint256 balance = balanceOf(owner);
        tokenIds = new uint256[](balance);
        types = new uint256[](balance);

        uint256 index = 0;
        for (uint256 i = 0; i < _tokenIdCounter && index < balance; i++) {
            if (_exists(i) && ownerOf(i) == owner) {
                tokenIds[index] = i;
                types[index] = itemType[i];
                index++;
            }
        }
        return (tokenIds, types);
    }

    function getUnclaimedKitties(address owner) external view returns (uint256[] memory) {
        uint256 kittySupply = pepeKitties.totalMinted();
        uint256 count = 0;

        // First pass: count unclaimed
        for (uint256 i = 0; i < kittySupply; i++) {
            try pepeKitties.ownerOf(i) returns (address kittyOwner) {
                if (kittyOwner == owner && !hasClaimed[i]) {
                    count++;
                }
            } catch {
                continue;
            }
        }

        // Second pass: collect IDs
        uint256[] memory unclaimed = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < kittySupply && index < count; i++) {
            try pepeKitties.ownerOf(i) returns (address kittyOwner) {
                if (kittyOwner == owner && !hasClaimed[i]) {
                    unclaimed[index] = i;
                    index++;
                }
            } catch {
                continue;
            }
        }

        return unclaimed;
    }

    // ============ Required Overrides ============

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721AC, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _requireCallerIsContractOwner() internal view override {
        _checkOwner();
    }

    // Allow contract to receive ETH for chest rewards
    receive() external payable {}
}
