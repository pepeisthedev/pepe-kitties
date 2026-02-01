// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IFregs {
    function ownerOf(uint256 tokenId) external view returns (address);
    function rerollHead(uint256 tokenId, address sender) external;
    function setTrait(uint256 tokenId, uint256 traitType, uint256 traitValue, address sender) external;
    function setBodyColor(uint256 tokenId, string memory _color, address sender) external;
    function totalMinted() external view returns (uint256);
}

interface ISVGItemsRenderer {
    function render(uint256 _itemType) external view returns (string memory);
}

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

contract FregsItems is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    // Item type constants (original built-in items)
    uint256 public constant COLOR_CHANGE = 1;   // Most common - change body color
    uint256 public constant HEAD_REROLL = 2;
    uint256 public constant BRONZE_SKIN = 3;
    uint256 public constant SILVER_SKIN = 4;
    uint256 public constant GOLD_SKIN = 5;
    uint256 public constant TREASURE_CHEST = 6;
    uint256 public constant BEAD_PUNK = 7;      // External NFT reward

    // Special dice item (reserved ID)
    uint256 public constant SPECIAL_DICE = 100;

    // Trait type constants (must match Fregs.sol) - simplified
    uint256 public constant TRAIT_BACKGROUND = 0;
    uint256 public constant TRAIT_BODY = 1;
    uint256 public constant TRAIT_HEAD = 2;
    uint256 public constant TRAIT_MOUTH = 3;
    uint256 public constant TRAIT_BELLY = 4;

    // Dynamic item type configuration
    struct ItemTypeConfig {
        string name;
        string description;
        uint256 targetTraitType;  // Which trait this affects (TRAIT_SPECIAL_HEAD, etc.) - 0 for non-trait items
        uint256 traitValue;       // The variant ID to apply
        bool isOwnerMintable;
        bool isClaimable;
        uint256 claimWeight;
    }
    mapping(uint256 => ItemTypeConfig) public itemTypeConfigs;
    uint256 public nextItemTypeId = 101;  // Start after reserved IDs (100 = SPECIAL_DICE)

    // Special trait max variants for dice rolls
    mapping(uint256 => uint256) public specialTraitMaxVariants;  // traitType => maxVariantId

    IFregs public fregs;
    ISVGItemsRenderer public svgRenderer;
    IERC721 public beadPunksContract;

    uint256 private _tokenIdCounter;
    uint256 private randomNonce;

    // Track which fregs have claimed items
    mapping(uint256 => bool) public hasClaimed;

    // Item type for each token
    mapping(uint256 => uint256) public itemType;

    // Treasure chest tracking
    uint256 public treasureChestCount;      // Total chests ever found (max 5)
    uint256 public chestsBurned;            // Total chests burned (for calculating active supply)
    uint256 public constant MAX_TREASURE_CHESTS = 5;
    uint256 public chestETHAmount = 0.1 ether;

    // Rarity weights (out of 10000)
    uint256 public colorChangeWeight = 4000;  // 40% - most common
    uint256 public headRerollWeight = 3000;   // 30%
    uint256 public bronzeSkinWeight = 1500;   // 15%
    uint256 public silverSkinWeight = 1000;   // 10%
    uint256 public goldSkinWeight = 500;      // 5%
    uint256 public beadPunkWeight = 100;      // 1% - rare external NFT (only when available)
    uint256 public treasureChestWeight = 50;  // 0.5% - ultra rare, max 5 ever

    // Events
    event ItemClaimed(
        uint256 indexed fregId,
        uint256 indexed itemTokenId,
        address indexed owner,
        uint256 itemType
    );

    event ColorChangeUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
        address indexed owner,
        string newColor
    );

    event HeadRerollUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
        address indexed owner
    );

    event SpecialSkinItemUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
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

    event BeadPunkClaimed(
        uint256 indexed fregId,
        uint256 indexed beadPunkTokenId,
        address indexed owner
    );

    event ItemTypeAdded(
        uint256 indexed itemTypeId,
        string name,
        uint256 targetTraitType,
        uint256 traitValue
    );

    event OwnerMinted(
        uint256 indexed itemTokenId,
        address indexed to,
        uint256 itemType,
        uint256 amount
    );

    event SpecialTraitItemUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
        address indexed owner,
        uint256 traitType,
        uint256 traitValue
    );

    event SpecialDiceUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
        uint256 traitType,
        uint256 traitValue
    );

    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_,
        address _fregs
    )
        ERC721AC(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
        Ownable(address(msg.sender))
    {
        fregs = IFregs(_fregs);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "data:application/json;base64,";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        require(address(svgRenderer) != address(0), "SVG renderer not set");

        string memory itemName = _getItemName(itemType[tokenId]);
        string memory itemDescription = _getItemDescription(itemType[tokenId]);

        // Item types are 1-indexed, but SVGRouter is 0-indexed
        string memory svg = svgRenderer.render(itemType[tokenId] - 1);

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

    function _getItemName(uint256 _itemType) internal view returns (string memory) {
        // Built-in items
        if (_itemType == COLOR_CHANGE) return "Color Change";
        if (_itemType == HEAD_REROLL) return "Head Reroll";
        if (_itemType == BRONZE_SKIN) return "Bronze Skin";
        if (_itemType == SILVER_SKIN) return "Silver Skin";
        if (_itemType == GOLD_SKIN) return "Gold Skin";
        if (_itemType == TREASURE_CHEST) return "Treasure Chest";
        if (_itemType == SPECIAL_DICE) return "Special Dice";

        // Dynamic items
        if (bytes(itemTypeConfigs[_itemType].name).length > 0) {
            return itemTypeConfigs[_itemType].name;
        }

        return "Unknown";
    }

    function _getItemDescription(uint256 _itemType) internal view returns (string memory) {
        // Built-in items
        if (_itemType == COLOR_CHANGE) return "Change your Freg's body color to any hex color";
        if (_itemType == HEAD_REROLL) return "Use this item to reroll your Freg's head trait";
        if (_itemType == BRONZE_SKIN) return "Apply a bronze skin to your Freg";
        if (_itemType == SILVER_SKIN) return "Apply a silver skin to your Freg";
        if (_itemType == GOLD_SKIN) return "Apply a golden skin to your Freg";
        if (_itemType == TREASURE_CHEST) return "Burn this chest to claim ETH rewards";
        if (_itemType == SPECIAL_DICE) return "Roll for a random special trait on your Freg";

        // Dynamic items
        if (bytes(itemTypeConfigs[_itemType].description).length > 0) {
            return itemTypeConfigs[_itemType].description;
        }

        return "Unknown item";
    }

    // ============ Claim Item ============

    function claimItem(uint256 fregId) external nonReentrant {
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");
        require(!hasClaimed[fregId], "Already claimed");

        hasClaimed[fregId] = true;

        // Check if we have any Bead Punks available
        bool hasBeadPunks = address(beadPunksContract) != address(0) &&
                           beadPunksContract.balanceOf(address(this)) > 0;

        // Check if treasure chests are still available (max 5 ever)
        bool chestsAvailable = treasureChestCount < MAX_TREASURE_CHESTS;

        // Calculate total weight (only include special items if available)
        uint256 totalWeight = colorChangeWeight + headRerollWeight + bronzeSkinWeight +
                              silverSkinWeight + goldSkinWeight;
        if (hasBeadPunks) {
            totalWeight += beadPunkWeight;
        }
        if (chestsAvailable) {
            totalWeight += treasureChestWeight;
        }

        // Determine item type based on weighted random
        uint256 rand = _getRandom(totalWeight);
        uint256 newItemType;
        uint256 cumulative = 0;

        // Check for Bead Punk first (if available)
        if (hasBeadPunks) {
            cumulative += beadPunkWeight;
            if (rand < cumulative) {
                // Transfer a Bead Punk to the user
                uint256 beadPunkTokenId = beadPunksContract.tokenOfOwnerByIndex(address(this), 0);
                beadPunksContract.safeTransferFrom(address(this), msg.sender, beadPunkTokenId);
                emit BeadPunkClaimed(fregId, beadPunkTokenId, msg.sender);
                // Also emit ItemClaimed for consistency with BEAD_PUNK type
                emit ItemClaimed(fregId, beadPunkTokenId, msg.sender, BEAD_PUNK);
                return;
            }
        }

        // Check for Treasure Chest (ultra rare, if still available)
        if (chestsAvailable) {
            cumulative += treasureChestWeight;
            if (rand < cumulative) {
                uint256 chestId = _tokenIdCounter;
                _safeMint(msg.sender, 1);
                _tokenIdCounter += 1;
                itemType[chestId] = TREASURE_CHEST;
                treasureChestCount += 1;

                emit TreasureChestMinted(chestId, msg.sender);
                emit ItemClaimed(fregId, chestId, msg.sender, TREASURE_CHEST);
                return;
            }
        }

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

        emit ItemClaimed(fregId, newItemId, msg.sender, newItemType);
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

    function useColorChange(uint256 itemTokenId, uint256 fregId, string memory newColor) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(itemType[itemTokenId] == COLOR_CHANGE, "Not a color change item");
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");

        _burn(itemTokenId);
        fregs.setBodyColor(fregId, newColor, msg.sender);

        emit ColorChangeUsed(itemTokenId, fregId, msg.sender, newColor);
    }

    function useHeadReroll(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(itemType[itemTokenId] == HEAD_REROLL, "Not a head reroll item");
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");

        _burn(itemTokenId);
        fregs.rerollHead(fregId, msg.sender);

        emit HeadRerollUsed(itemTokenId, fregId, msg.sender);
    }

    function useSpecialSkinItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");

        uint256 iType = itemType[itemTokenId];
        require(
            iType == BRONZE_SKIN || iType == SILVER_SKIN || iType == GOLD_SKIN,
            "Not a special skin item"
        );

        // Determine body type (1=bronze, 2=silver, 3=gold)
        uint256 bodyValue;
        if (iType == BRONZE_SKIN) bodyValue = 1;
        else if (iType == SILVER_SKIN) bodyValue = 2;
        else bodyValue = 3; // GOLD_SKIN

        _burn(itemTokenId);
        fregs.setTrait(fregId, TRAIT_BODY, bodyValue, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, TRAIT_BODY, bodyValue);
    }

    // Use a dynamic trait item
    function useDynamicTraitItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");

        uint256 iType = itemType[itemTokenId];
        ItemTypeConfig storage config = itemTypeConfigs[iType];

        require(bytes(config.name).length > 0, "Unknown item type");
        require(config.targetTraitType <= TRAIT_BELLY, "Not a trait item");

        _burn(itemTokenId);
        fregs.setTrait(fregId, config.targetTraitType, config.traitValue, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, config.targetTraitType, config.traitValue);
    }

    // Use special dice for random trait
    function useSpecialDice(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        require(ownerOf(itemTokenId) == msg.sender, "Not item owner");
        require(itemType[itemTokenId] == SPECIAL_DICE, "Not a special dice");
        require(fregs.ownerOf(fregId) == msg.sender, "Not freg owner");

        // Count available trait types (only those with max variants set)
        uint256[] memory availableTraits = new uint256[](5);
        uint256 availableCount = 0;

        for (uint256 t = TRAIT_BACKGROUND; t <= TRAIT_BELLY; t++) {
            if (specialTraitMaxVariants[t] > 0) {
                availableTraits[availableCount] = t;
                availableCount++;
            }
        }
        require(availableCount > 0, "No traits configured for dice");

        _burn(itemTokenId);

        // Random trait type from available ones
        uint256 traitIndex = _getRandom(availableCount);
        uint256 traitType = availableTraits[traitIndex];

        // Random variant within that trait type
        uint256 maxVariant = specialTraitMaxVariants[traitType];
        uint256 variant = _getRandom(maxVariant) + 1;

        // Apply the trait
        fregs.setTrait(fregId, traitType, variant, msg.sender);

        emit SpecialDiceUsed(itemTokenId, fregId, traitType, variant);
    }

    function burnChest(uint256 chestTokenId) external nonReentrant {
        require(ownerOf(chestTokenId) == msg.sender, "Not chest owner");
        require(itemType[chestTokenId] == TREASURE_CHEST, "Not a treasure chest");
        require(address(this).balance >= chestETHAmount, "Insufficient contract balance");

        _burn(chestTokenId);
        chestsBurned += 1;
        // Note: treasureChestCount is NOT decremented because it tracks total chests ever found (max 5)

        payable(msg.sender).transfer(chestETHAmount);

        emit TreasureChestBurned(chestTokenId, msg.sender, chestETHAmount);
    }

    // ============ Owner Functions ============

    // Owner mint function for minting any item type to any address
    function ownerMint(address to, uint256 _itemType, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        require(
            _itemType == COLOR_CHANGE ||
            _itemType == HEAD_REROLL ||
            _itemType == BRONZE_SKIN ||
            _itemType == SILVER_SKIN ||
            _itemType == GOLD_SKIN ||
            _itemType == SPECIAL_DICE ||
            bytes(itemTypeConfigs[_itemType].name).length > 0,
            "Invalid item type"
        );

        uint256 startTokenId = _tokenIdCounter;
        _safeMint(to, amount);
        _tokenIdCounter += amount;

        // Set item type for each minted token
        for (uint256 i = 0; i < amount; i++) {
            itemType[startTokenId + i] = _itemType;
        }

        emit OwnerMinted(startTokenId, to, _itemType, amount);
    }

    // Add a new dynamic item type
    function addItemType(
        string calldata name,
        string calldata description,
        uint256 targetTraitType,
        uint256 traitValue,
        bool isOwnerMintable,
        bool isClaimable,
        uint256 claimWeight
    ) external onlyOwner returns (uint256 itemTypeId) {
        require(bytes(name).length > 0, "Name required");

        itemTypeId = nextItemTypeId;
        nextItemTypeId++;

        itemTypeConfigs[itemTypeId] = ItemTypeConfig({
            name: name,
            description: description,
            targetTraitType: targetTraitType,
            traitValue: traitValue,
            isOwnerMintable: isOwnerMintable,
            isClaimable: isClaimable,
            claimWeight: claimWeight
        });

        emit ItemTypeAdded(itemTypeId, name, targetTraitType, traitValue);
        return itemTypeId;
    }

    // Update an existing dynamic item type
    function updateItemType(
        uint256 itemTypeId,
        string calldata name,
        string calldata description,
        uint256 targetTraitType,
        uint256 traitValue,
        bool isOwnerMintable,
        bool isClaimable,
        uint256 claimWeight
    ) external onlyOwner {
        require(bytes(itemTypeConfigs[itemTypeId].name).length > 0, "Item type does not exist");

        itemTypeConfigs[itemTypeId] = ItemTypeConfig({
            name: name,
            description: description,
            targetTraitType: targetTraitType,
            traitValue: traitValue,
            isOwnerMintable: isOwnerMintable,
            isClaimable: isClaimable,
            claimWeight: claimWeight
        });
    }

    // Set max variants for a trait type (for dice rolls)
    function setTraitMaxVariants(uint256 traitType, uint256 maxVariant) external onlyOwner {
        require(traitType <= TRAIT_BELLY, "Invalid trait type");
        specialTraitMaxVariants[traitType] = maxVariant;
    }

    // Batch set max variants for all trait types
    function setAllTraitMaxVariants(
        uint256 maxBackground,
        uint256 maxBody,
        uint256 maxHead,
        uint256 maxMouth,
        uint256 maxBelly
    ) external onlyOwner {
        specialTraitMaxVariants[TRAIT_BACKGROUND] = maxBackground;
        specialTraitMaxVariants[TRAIT_BODY] = maxBody;
        specialTraitMaxVariants[TRAIT_HEAD] = maxHead;
        specialTraitMaxVariants[TRAIT_MOUTH] = maxMouth;
        specialTraitMaxVariants[TRAIT_BELLY] = maxBelly;
    }

    function setFregs(address _fregs) external onlyOwner {
        fregs = IFregs(_fregs);
    }

    function setSVGRenderer(address _svgRenderer) external onlyOwner {
        svgRenderer = ISVGItemsRenderer(_svgRenderer);
    }

    function setChestETHAmount(uint256 _amount) external onlyOwner {
        chestETHAmount = _amount;
    }

    function setBeadPunksContract(address _beadPunks) external onlyOwner {
        beadPunksContract = IERC721(_beadPunks);
    }

    function setBeadPunkWeight(uint256 _weight) external onlyOwner {
        beadPunkWeight = _weight;
    }

    function setTreasureChestWeight(uint256 _weight) external onlyOwner {
        treasureChestWeight = _weight;
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
        uint256 activeChests = treasureChestCount - chestsBurned;
        uint256 reserved = activeChests * chestETHAmount;
        require(address(this).balance > reserved, "No excess funds");
        payable(owner()).transfer(address(this).balance - reserved);
    }

    function depositETH() external payable onlyOwner {}

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getAvailableBeadPunks() public view returns (uint256) {
        if (address(beadPunksContract) == address(0)) return 0;
        return beadPunksContract.balanceOf(address(this));
    }

    function getActiveChestSupply() public view returns (uint256) {
        return treasureChestCount - chestsBurned;
    }

    function getRemainingChests() public view returns (uint256) {
        return MAX_TREASURE_CHESTS - treasureChestCount;
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

    function getUnclaimedFregs(address owner) external view returns (uint256[] memory) {
        uint256 fregSupply = fregs.totalMinted();
        uint256 count = 0;

        // First pass: count unclaimed
        for (uint256 i = 0; i < fregSupply; i++) {
            try fregs.ownerOf(i) returns (address fregOwner) {
                if (fregOwner == owner && !hasClaimed[i]) {
                    count++;
                }
            } catch {
                continue;
            }
        }

        // Second pass: collect IDs
        uint256[] memory unclaimed = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < fregSupply && index < count; i++) {
            try fregs.ownerOf(i) returns (address fregOwner) {
                if (fregOwner == owner && !hasClaimed[i]) {
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

    // Allow contract to receive ERC721 NFTs (Bead Punks)
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // Allow contract to receive ETH for chest rewards
    receive() external payable {}
}
