// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "./interfaces/IFregsRandomizer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFregs {
    function ownerOf(uint256 tokenId) external view returns (address);
    function prepareHeadReroll(uint256 tokenId, address sender, uint256 actionId) external;
    function fulfillHeadReroll(uint256 actionId, address sender, uint256 tokenId, uint256 randomWord) external;
    function clearPendingHeadReroll(uint256 tokenId, uint256 actionId) external;
    function setTrait(uint256 tokenId, uint256 traitType, uint256 traitValue, address sender) external;
    function setBodyColor(uint256 tokenId, string memory _color, address sender) external;
    function setMutated(uint256 tokenId, address sender) external;
    function totalMinted() external view returns (uint256);
    function body(uint256 tokenId) external view returns (uint256);
    function head(uint256 tokenId) external view returns (uint256);
}

interface ISVGItemsRenderer {
    function render(uint256 _itemType) external view returns (string memory);
}

contract FregsItems is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    error AlreadyClaimedErr();
    error ClaimRequestsPending();
    error HeadRerollsPending();
    error InsufficientCoinBalance();
    error InvalidAmount();
    error InvalidItemType();
    error InvalidTraitType();
    error LengthMismatchErr();
    error MissingPendingRequest();
    error NameRequired();
    error NoClaimWeights();
    error NoExcessCoins();
    error NotFregOwner();
    error NotItemOwner();
    error OnlyRandomizer();
    error OnlyShopContract();
    error OnlySpinContract();
    error PendingRequestMismatch();
    error RandomRequestsPending();
    error RandomizerNotSet();
    error SVGRendererNotSet();
    error TokenDoesNotExist();

    // Item type constants
    uint256 public constant COLOR_CHANGE = 1;
    uint256 public constant HEAD_REROLL = 2;
    uint256 public constant METAL_SKIN = 4;
    uint256 public constant GOLD_SKIN = 5;
    uint256 public constant TREASURE_CHEST = 6;
    uint256 public constant DIAMOND_SKIN = 8;
    uint256 public constant HOODIE = 9;
    uint256 public constant FROGSUIT = 10;
    uint256 public constant SKELETON_SKIN = 11;  // Bone
    uint256 public constant MUTATION = 12;

    // Skeleton skin trait value (set during deployment, matches traitFileName 4.svg)
    uint256 public skeletonSkinTraitValue;

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
    uint256 public nextItemTypeId = 101;  // Start after reserved IDs

    // Special trait max variants for dice rolls
    mapping(uint256 => uint256) public specialTraitMaxVariants;  // traitType => maxVariantId

    // Dynamic skin item type to trait value mapping (configured at deployment)
    // Maps item type (METAL_SKIN, DIAMOND_SKIN, etc.) to the actual trait value in skinContract
    mapping(uint256 => uint256) public skinItemToTraitValue;

    // Dynamic head item type to trait value mapping (configured at deployment)
    // Maps item type (HOODIE, FROGSUIT, etc.) to the actual trait value in headContract
    mapping(uint256 => uint256) public headItemToTraitValue;

    IFregs public fregs;
    ISVGItemsRenderer public svgRenderer;
    IFregsRandomizer public randomizer;
    address public spinTheWheelContract;
    address public fregCoinContract;
    address public shopContract;

    bool public chestOpeningActive;

    // Configurable mutation item type (set by owner after deploying the serum as a shop item)
    uint256 public mutationItemTypeId;

    uint256 private _tokenIdCounter;
    uint256 public nextClaimActionId;
    uint256 public nextHeadRerollActionId;
    uint256 public pendingClaimCount;
    uint256 public pendingHeadRerollCount;

    struct PendingClaim {
        address requester;
        uint256 fregId;
        bool active;
    }

    struct PendingHeadReroll {
        address requester;
        uint256 itemTokenId;
        uint256 fregId;
        bool active;
    }

    mapping(uint256 => PendingClaim) private pendingClaims;
    mapping(uint256 => uint256) public claimActionByRequestId;

    mapping(uint256 => PendingHeadReroll) private pendingHeadRerolls;
    mapping(uint256 => uint256) public headRerollActionByRequestId;
    mapping(uint256 => uint256) public headRerollRequestIdByAction;
    mapping(uint256 => uint256) public pendingHeadRerollActionByFregId;

    // Track which fregs have claimed items
    mapping(uint256 => bool) public hasClaimed;

    // Item type for each token
    mapping(uint256 => uint256) public itemType;

    // Treasure chest tracking
    uint256 public claimChestCount;         // Chests minted via claims (max 300)
    uint256 public totalChestsMinted;       // All chests ever minted (claims + spins)
    uint256 public chestsBurned;            // Total chests burned
    uint256 public constant MAX_CLAIM_CHESTS = 300;
    uint256 public chestCoinReward = 133_700_000 ether;  // 0.01% of 1.337T FregCoin supply

    // Rarity weights for claimable items
    uint256 public colorChangeWeight = 5500;    // 55%
    uint256 public headRerollWeight = 3000;     // 30%
    uint256 public treasureChestWeight = 1000;  // 10%
    uint256 public metalSkinWeight = 200;       // 2%
    uint256 public goldSkinWeight = 100;        // 1%
    uint256 public diamondSkinWeight = 100;     // 1%
    uint256 public boneWeight = 50;             // 0.5%
    // Non-claimable weights (spin wheel exclusive)
    uint256 public hoodieWeight = 0;
    uint256 public frogsuitWeight = 0;

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
        uint256 coinAmount
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

    event MintedFromCoin(
        uint256 indexed itemTokenId,
        address indexed to,
        uint256 itemType
    );

    event SpecialTraitItemUsed(
        uint256 indexed itemTokenId,
        uint256 indexed fregId,
        address indexed owner,
        uint256 traitType,
        uint256 traitValue
    );

    event MintedFromShop(
        uint256 indexed itemTokenId,
        address indexed to,
        uint256 itemType
    );
    event ClaimItemRequested(
        uint256 indexed requestId,
        uint256 indexed actionId,
        uint256 indexed fregId,
        address owner
    );
    event HeadRerollRequested(
        uint256 indexed requestId,
        uint256 indexed actionId,
        uint256 indexed itemTokenId,
        uint256 fregId,
        address owner
    );

    modifier onlyRandomizer() {
        if (address(randomizer) == address(0) || msg.sender != address(randomizer)) revert OnlyRandomizer();
        _;
    }

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

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        if (address(svgRenderer) == address(0)) revert SVGRendererNotSet();

        string memory itemName = _getItemName(itemType[tokenId]);
        string memory itemDescription = _getItemDescription(itemType[tokenId]);

        string memory svg = svgRenderer.render(itemType[tokenId]);

        // Build JSON with embedded SVG (no base64 encoding)
        // SVG uses single quotes so it can be embedded in JSON double-quoted strings
        return string(
            abi.encodePacked(
                'data:application/json,{"name":"',
                itemName,
                ' #',
                Strings.toString(tokenId),
                '","description":"',
                itemDescription,
                '","image":"data:image/svg+xml,',
                svg,
                '","attributes":[{"trait_type":"Item Type","value":"',
                itemName,
                '"}]}'
            )
        );
    }

    function _getItemName(uint256 _itemType) internal view returns (string memory) {
        // Check itemTypeConfigs first (works for both built-in and dynamic items)
        if (bytes(itemTypeConfigs[_itemType].name).length > 0) {
            return itemTypeConfigs[_itemType].name;
        }
        return "Unknown";
    }

    function _getItemDescription(uint256 _itemType) internal view returns (string memory) {
        // Check itemTypeConfigs first (works for both built-in and dynamic items)
        if (bytes(itemTypeConfigs[_itemType].description).length > 0) {
            return itemTypeConfigs[_itemType].description;
        }
        return "Unknown item";
    }

    // ============ Claim Item ============

    function claimItem(uint256 fregId) external nonReentrant {
        if (address(randomizer) == address(0)) revert RandomizerNotSet();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();
        if (hasClaimed[fregId]) revert AlreadyClaimedErr();
        if (_getClaimTotalWeight() == 0) revert NoClaimWeights();

        uint256 actionId = ++nextClaimActionId;
        pendingClaims[actionId] = PendingClaim({
            requester: msg.sender,
            fregId: fregId,
            active: true
        });
        hasClaimed[fregId] = true;
        pendingClaimCount += 1;

        uint256 requestId = randomizer.requestClaimItem(msg.sender, fregId, actionId);
        if (pendingClaims[actionId].active) {
            claimActionByRequestId[requestId] = actionId;
        }
        emit ClaimItemRequested(requestId, actionId, fregId, msg.sender);
    }

    // Intentionally not nonReentrant so localhost mock VRF auto-fulfill can settle in the same tx.
    function fulfillClaimItem(
        uint256 requestId,
        uint256 actionId,
        address requester,
        uint256 fregId,
        uint256 randomWord
    ) external onlyRandomizer {
        PendingClaim memory pending = pendingClaims[actionId];
        if (!pending.active) revert MissingPendingRequest();
        if (pending.requester != requester || pending.fregId != fregId) revert PendingRequestMismatch();

        uint256 trackedActionId = claimActionByRequestId[requestId];
        if (trackedActionId != 0 && trackedActionId != actionId) revert PendingRequestMismatch();

        delete pendingClaims[actionId];
        delete claimActionByRequestId[requestId];
        pendingClaimCount -= 1;

        uint256 newItemType = _selectClaimItemType(randomWord);
        uint256 newItemId = _mintSingleItem(requester, newItemType);

        if (newItemType == TREASURE_CHEST) {
            claimChestCount += 1;
            totalChestsMinted += 1;
            emit TreasureChestMinted(newItemId, requester);
        }

        emit ItemClaimed(fregId, newItemId, requester, newItemType);
    }

    // ============ Use Items ============

    function useColorChange(uint256 itemTokenId, uint256 fregId, string memory newColor) external nonReentrant {
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (itemType[itemTokenId] != COLOR_CHANGE) revert InvalidItemType();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        _burn(itemTokenId);
        fregs.setBodyColor(fregId, newColor, msg.sender);

        emit ColorChangeUsed(itemTokenId, fregId, msg.sender, newColor);
    }

    function useHeadReroll(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        if (address(randomizer) == address(0)) revert RandomizerNotSet();
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (itemType[itemTokenId] != HEAD_REROLL) revert InvalidItemType();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        uint256 actionId = ++nextHeadRerollActionId;
        pendingHeadRerolls[actionId] = PendingHeadReroll({
            requester: msg.sender,
            itemTokenId: itemTokenId,
            fregId: fregId,
            active: true
        });
        pendingHeadRerollActionByFregId[fregId] = actionId;
        pendingHeadRerollCount += 1;

        fregs.prepareHeadReroll(fregId, msg.sender, actionId);
        _burn(itemTokenId);
        uint256 requestId = randomizer.requestHeadReroll(msg.sender, itemTokenId, fregId, actionId);
        if (pendingHeadRerolls[actionId].active) {
            headRerollActionByRequestId[requestId] = actionId;
            headRerollRequestIdByAction[actionId] = requestId;
        }

        emit HeadRerollRequested(requestId, actionId, itemTokenId, fregId, msg.sender);
    }

    function fulfillHeadReroll(
        uint256 requestId,
        uint256 actionId,
        address requester,
        uint256 itemTokenId,
        uint256 fregId,
        uint256 randomWord
    )
        external
        onlyRandomizer
    {
        PendingHeadReroll memory pending = pendingHeadRerolls[actionId];
        if (!pending.active) revert MissingPendingRequest();
        if (pending.requester != requester || pending.itemTokenId != itemTokenId || pending.fregId != fregId) {
            revert PendingRequestMismatch();
        }

        uint256 trackedActionId = headRerollActionByRequestId[requestId];
        if (trackedActionId != 0 && trackedActionId != actionId) revert PendingRequestMismatch();

        fregs.fulfillHeadReroll(actionId, requester, fregId, randomWord);

        delete pendingHeadRerolls[actionId];
        delete pendingHeadRerollActionByFregId[fregId];
        delete headRerollActionByRequestId[requestId];
        delete headRerollRequestIdByAction[actionId];
        pendingHeadRerollCount -= 1;

        emit HeadRerollUsed(itemTokenId, fregId, requester);
    }

    // Rescue a stuck head reroll — clears the pending flag and mints a new HEAD_REROLL
    // item to the freg owner so they can re-roll themselves. No VRF fee required.
    function rescueHeadReroll(uint256 fregId) external onlyOwner nonReentrant {
        address fregOwner = fregs.ownerOf(fregId);

        uint256 actionId = pendingHeadRerollActionByFregId[fregId];
        if (actionId == 0) revert MissingPendingRequest();

        PendingHeadReroll memory pending = pendingHeadRerolls[actionId];
        if (!pending.active) revert MissingPendingRequest();

        uint256 requestId = headRerollRequestIdByAction[actionId];
        if (requestId == 0) revert MissingPendingRequest();

        delete pendingHeadRerolls[actionId];
        delete pendingHeadRerollActionByFregId[fregId];
        delete headRerollActionByRequestId[requestId];
        delete headRerollRequestIdByAction[actionId];
        pendingHeadRerollCount -= 1;

        fregs.clearPendingHeadReroll(fregId, actionId);
        randomizer.cancelRequest(requestId);
        _mintSingleItem(fregOwner, HEAD_REROLL);
    }

    function useSpecialSkinItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        uint256 iType = itemType[itemTokenId];

        // Get body value from dynamic mapping (configured at deployment to match traits.json)
        // If trait value is configured (> 0), it's a valid skin item
        uint256 bodyValue = skinItemToTraitValue[iType];
        if (bodyValue == 0) revert InvalidItemType();

        // Skeleton skin cannot be applied to fregs wearing hoodie or frogsuit
        if (iType == SKELETON_SKIN) {
            uint256 currentHead = fregs.head(fregId);
            uint256 hoodieHead = headItemToTraitValue[HOODIE];
            uint256 frogsuitHead = headItemToTraitValue[FROGSUIT];
            if (currentHead == hoodieHead || currentHead == frogsuitHead) revert InvalidItemType();
        }

        _burn(itemTokenId);
        fregs.setTrait(fregId, TRAIT_BODY, bodyValue, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, TRAIT_BODY, bodyValue);
    }

    // Use a dynamic trait item
    function useDynamicTraitItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        uint256 iType = itemType[itemTokenId];
        ItemTypeConfig storage config = itemTypeConfigs[iType];

        if (bytes(config.name).length == 0) revert InvalidItemType();
        if (config.targetTraitType > TRAIT_BELLY) revert InvalidTraitType();

        _burn(itemTokenId);
        fregs.setTrait(fregId, config.targetTraitType, config.traitValue, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, config.targetTraitType, config.traitValue);
    }

    // Use a head trait item (Hoodie, Frogsuit, etc.)
    function useHeadTraitItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        uint256 iType = itemType[itemTokenId];

        // Get head value from dynamic mapping (configured at deployment to match traits.json)
        uint256 headValue = headItemToTraitValue[iType];
        if (headValue == 0) revert InvalidItemType();

        // Hoodie and Frogsuit cannot be applied to skeleton fregs
        if (iType == HOODIE || iType == FROGSUIT) {
            uint256 currentBody = fregs.body(fregId);
            uint256 skeletonBody = skinItemToTraitValue[SKELETON_SKIN];
            if (currentBody == skeletonBody) revert InvalidItemType();
        }

        _burn(itemTokenId);
        fregs.setTrait(fregId, TRAIT_HEAD, headValue, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, TRAIT_HEAD, headValue);
    }

    function useMutationItem(uint256 itemTokenId, uint256 fregId) external nonReentrant {
        if (mutationItemTypeId == 0) revert InvalidItemType();
        if (ownerOf(itemTokenId) != msg.sender) revert NotItemOwner();
        if (itemType[itemTokenId] != mutationItemTypeId) revert InvalidItemType();
        if (fregs.ownerOf(fregId) != msg.sender) revert NotFregOwner();

        _burn(itemTokenId);
        fregs.setMutated(fregId, msg.sender);

        emit SpecialTraitItemUsed(itemTokenId, fregId, msg.sender, 99, 1);
    }

    function burnChest(uint256 chestTokenId) external nonReentrant {
        if (!chestOpeningActive) revert InvalidItemType();
        if (ownerOf(chestTokenId) != msg.sender) revert NotItemOwner();
        if (itemType[chestTokenId] != TREASURE_CHEST) revert InvalidItemType();
        if (IERC20(fregCoinContract).balanceOf(address(this)) < chestCoinReward) revert InsufficientCoinBalance();

        _burn(chestTokenId);
        chestsBurned += 1;

        IERC20(fregCoinContract).transfer(msg.sender, chestCoinReward);

        emit TreasureChestBurned(chestTokenId, msg.sender, chestCoinReward);
    }

    // ============ Owner Functions ============

    function setMutationItemTypeId(uint256 _itemTypeId) external onlyOwner {
        if (_itemTypeId < 101) revert InvalidItemType();
        if (bytes(itemTypeConfigs[_itemTypeId].name).length == 0) revert InvalidItemType();
        mutationItemTypeId = _itemTypeId;
    }

    // Owner mint function for minting any item type to any address
    function ownerMint(address to, uint256 _itemType, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();
        if (_itemType < 101) revert InvalidItemType();
        if (bytes(itemTypeConfigs[_itemType].name).length == 0) revert InvalidItemType();

        uint256 startTokenId = _tokenIdCounter;
        _safeMint(to, amount);
        _tokenIdCounter += amount;

        // Set item type for each minted token
        for (uint256 i = 0; i < amount; i++) {
            itemType[startTokenId + i] = _itemType;
        }

        emit OwnerMinted(startTokenId, to, _itemType, amount);
    }

    // Mint from SpinTheWheel spin wheel
    function mintFromCoin(address to, uint256 _itemType) external {
        if (msg.sender != spinTheWheelContract) revert OnlySpinContract();
        if (bytes(itemTypeConfigs[_itemType].name).length == 0) revert InvalidItemType();

        uint256 newItemId = _tokenIdCounter;
        _safeMint(to, 1);
        _tokenIdCounter += 1;
        itemType[newItemId] = _itemType;

        if (_itemType == TREASURE_CHEST) {
            totalChestsMinted += 1;
        }

        emit MintedFromCoin(newItemId, to, _itemType);
    }

    // Mint from FregShop
    function mintFromShop(address to, uint256 _itemType) external {
        if (msg.sender != shopContract) revert OnlyShopContract();
        if (_itemType < 101) revert InvalidItemType();
        if (bytes(itemTypeConfigs[_itemType].name).length == 0) revert InvalidItemType();

        uint256 newItemId = _tokenIdCounter;
        _safeMint(to, 1);
        _tokenIdCounter += 1;
        itemType[newItemId] = _itemType;

        emit MintedFromShop(newItemId, to, _itemType);
    }

    function setChestOpeningActive(bool _active) external onlyOwner {
        chestOpeningActive = _active;
    }

    function setShopContract(address _shop) external onlyOwner {
        shopContract = _shop;
    }

    function setSpinTheWheelContract(address _spinTheWheel) external onlyOwner {
        if (pendingHeadRerollCount != 0) revert HeadRerollsPending();
        spinTheWheelContract = _spinTheWheel;
    }

    function setFregCoinContract(address _fregCoin) external onlyOwner {
        fregCoinContract = _fregCoin;
    }

    function setRandomizer(address _randomizer) external onlyOwner {
        if (pendingClaimCount != 0 || pendingHeadRerollCount != 0) revert RandomRequestsPending();
        randomizer = IFregsRandomizer(_randomizer);
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
        if (bytes(name).length == 0) revert NameRequired();

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
        if (bytes(itemTypeConfigs[itemTypeId].name).length == 0) revert InvalidItemType();

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
        if (traitType > TRAIT_BELLY) revert InvalidTraitType();
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
        if (pendingClaimCount != 0 || pendingHeadRerollCount != 0) revert RandomRequestsPending();
        fregs = IFregs(_fregs);
    }

    // Configure skin item type to trait value mapping (must match traits.json fileNames)
    function setSkinItemTraitValue(uint256 itemType_, uint256 traitValue) external onlyOwner {
        skinItemToTraitValue[itemType_] = traitValue;
    }

    // Configure head item type to trait value mapping (must match traits.json)
    function setHeadItemTraitValue(uint256 itemType_, uint256 traitValue) external onlyOwner {
        headItemToTraitValue[itemType_] = traitValue;
    }

    // Batch configure trait item mappings (skin and head) at once
    function setTraitItemMappingsBatch(
        uint256[] calldata itemTypes,
        uint256[] calldata traitValues
    ) external onlyOwner {
        if (itemTypes.length != traitValues.length) revert LengthMismatchErr();
        for (uint256 i = 0; i < itemTypes.length; i++) {
            uint256 iType = itemTypes[i];
            // Determine if it's a skin or head item based on item type constant
            if (iType == METAL_SKIN || iType == GOLD_SKIN || iType == DIAMOND_SKIN || iType == SKELETON_SKIN) {
                skinItemToTraitValue[iType] = traitValues[i];
            } else if (iType == HOODIE || iType == FROGSUIT) {
                headItemToTraitValue[iType] = traitValues[i];
            }
        }
    }

    // Configure a built-in item type's name and description
    function setBuiltInItemConfig(
        uint256 itemTypeId,
        string calldata name,
        string calldata description
    ) external onlyOwner {
        itemTypeConfigs[itemTypeId].name = name;
        itemTypeConfigs[itemTypeId].description = description;
    }

    // Batch configure multiple built-in items at once
    function setBuiltInItemConfigsBatch(
        uint256[] calldata itemTypeIds,
        string[] calldata names,
        string[] calldata descriptions
    ) external onlyOwner {
        if (itemTypeIds.length != names.length || names.length != descriptions.length) revert LengthMismatchErr();
        for (uint256 i = 0; i < itemTypeIds.length; i++) {
            itemTypeConfigs[itemTypeIds[i]].name = names[i];
            itemTypeConfigs[itemTypeIds[i]].description = descriptions[i];
        }
    }

    function setSVGRenderer(address _svgRenderer) external onlyOwner {
        svgRenderer = ISVGItemsRenderer(_svgRenderer);
    }

    function setChestCoinReward(uint256 _amount) external onlyOwner {
        chestCoinReward = _amount;
    }

    function setTreasureChestWeight(uint256 _weight) external onlyOwner {
        if (pendingClaimCount != 0) revert ClaimRequestsPending();
        treasureChestWeight = _weight;
    }

    function setHeadItemWeights(uint256 _hoodie, uint256 _frogsuit) external onlyOwner {
        hoodieWeight = _hoodie;
        frogsuitWeight = _frogsuit;
    }

    function setRarityWeights(
        uint256 _colorChange,
        uint256 _headReroll,
        uint256 _treasureChest,
        uint256 _metal,
        uint256 _gold,
        uint256 _diamond,
        uint256 _bone
    ) external onlyOwner {
        if (pendingClaimCount != 0) revert ClaimRequestsPending();
        colorChangeWeight = _colorChange;
        headRerollWeight = _headReroll;
        treasureChestWeight = _treasureChest;
        metalSkinWeight = _metal;
        goldSkinWeight = _gold;
        diamondSkinWeight = _diamond;
        boneWeight = _bone;
    }

    function rescuePendingClaimCount(uint256) external pure {
        revert("Use request-specific rescue");
    }

    function rescuePendingClaims(uint256[] calldata requestIds) external onlyOwner {
        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            uint256 actionId = claimActionByRequestId[requestId];
            if (actionId == 0) revert MissingPendingRequest();

            PendingClaim memory pending = pendingClaims[actionId];
            if (!pending.active) revert MissingPendingRequest();

            delete pendingClaims[actionId];
            delete claimActionByRequestId[requestId];
            pendingClaimCount -= 1;
            hasClaimed[pending.fregId] = false;

            randomizer.cancelRequest(requestId);
        }
    }

    function withdrawExcess() external onlyOwner {
        uint256 activeChests = totalChestsMinted - chestsBurned;
        uint256 reserved = activeChests * chestCoinReward;
        uint256 balance = IERC20(fregCoinContract).balanceOf(address(this));
        if (balance <= reserved) revert NoExcessCoins();
        IERC20(fregCoinContract).transfer(owner(), balance - reserved);
    }

    function depositCoins(uint256 amount) external onlyOwner {
        IERC20(fregCoinContract).transferFrom(msg.sender, address(this), amount);
    }

    function _mintSingleItem(address to, uint256 _itemType) internal returns (uint256 newItemId) {
        newItemId = _tokenIdCounter;
        _mint(to, 1);
        _tokenIdCounter += 1;
        itemType[newItemId] = _itemType;
    }

    function _getClaimTotalWeight() internal view returns (uint256 totalWeight) {
        totalWeight =
            colorChangeWeight +
            headRerollWeight +
            metalSkinWeight +
            goldSkinWeight +
            diamondSkinWeight +
            boneWeight;

        if (claimChestCount < MAX_CLAIM_CHESTS) {
            totalWeight += treasureChestWeight;
        }
    }

    function _selectClaimItemType(uint256 randomWord) internal view returns (uint256) {
        bool chestsAvailable = claimChestCount < MAX_CLAIM_CHESTS;
        uint256 totalWeight = _getClaimTotalWeight();

        if (totalWeight == 0) revert NoClaimWeights();
        uint256 rand = randomWord % totalWeight;
        uint256 cumulative = 0;

        if (chestsAvailable) {
            cumulative += treasureChestWeight;
            if (rand < cumulative) {
                return TREASURE_CHEST;
            }
        }

        cumulative += colorChangeWeight;
        if (rand < cumulative) {
            return COLOR_CHANGE;
        }

        cumulative += headRerollWeight;
        if (rand < cumulative) {
            return HEAD_REROLL;
        }

        cumulative += metalSkinWeight;
        if (rand < cumulative) {
            return METAL_SKIN;
        }

        cumulative += goldSkinWeight;
        if (rand < cumulative) {
            return GOLD_SKIN;
        }

        cumulative += diamondSkinWeight;
        if (rand < cumulative) {
            return DIAMOND_SKIN;
        }

        return SKELETON_SKIN;
    }

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }


    function getActiveChestSupply() public view returns (uint256) {
        return totalChestsMinted - chestsBurned;
    }

    function getRemainingClaimChests() public view returns (uint256) {
        return MAX_CLAIM_CHESTS - claimChestCount;
    }

    function getItemInfo(uint256 itemTokenId)
        external
        view
        returns (uint256 _itemType, string memory _name)
    {
        if (!_exists(itemTokenId)) revert TokenDoesNotExist();
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

    // ============ View Functions (continued) ============

    function coinBalance() public view returns (uint256) {
        return IERC20(fregCoinContract).balanceOf(address(this));
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
}
