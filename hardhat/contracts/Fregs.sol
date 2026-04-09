// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "./interfaces/IFregsRandomizer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IFregsMintPass {
    function burnForMint(address holder) external;
}

interface IFregsItemsReader {
    function hasClaimed(uint256 fregId) external view returns (bool);
}

interface ISVGRenderer {
    // Renders full SVG
    // background=0 uses bodyColor, background>0 uses special background
    // body=0 uses bodyColor, body>0 uses special body skin
    function render(
        string memory _bodyColor,
        uint256 _background,
        uint256 _body,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly
    ) external view returns (string memory);

    // Get trait name for metadata
    function meta(uint256 _traitType, uint256 _traitId) external view returns (string memory);

    // Get the number of base traits for a trait type (for mint randomization)
    function getBaseTraitCount(uint256 _traitType) external view returns (uint256);

    // Check if a trait ID is valid for a given trait type
    function isValidTrait(uint256 _traitType, uint256 _traitId) external view returns (bool);
}

contract Fregs is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    ISVGRenderer public svgRenderer;
    ISVGRenderer public mutationRenderer;
    IFregsRandomizer public randomizer;
    mapping(uint256 => bool) public isMutated;
    mapping(uint256 => bool) public pendingHeadReroll;

    uint256 private _tokenIdCounter;
    uint256 public pendingMintCount;
    uint256 public pendingHeadRerollCount;

    uint256 public mintPrice = 0.001 ether;
    uint256 public supply = 3000;
    address public itemsContract;
    address public mintPassContract;
    address public liquidityContract;

    // Mint phases: 0=Paused, 1=Whitelist, 2=Public
    uint256 public mintPhase;

    // Free mint wallets: address => remaining free mints
    mapping(address => uint256) public freeMints;

    // Weighted trait selection: cumulative weights per trait type
    // traitCumulativeWeights[traitType] = array where index i holds the
    // cumulative weight sum for trait (i+1). A roll in [0, totalWeight) is
    // compared against these to pick a trait.
    mapping(uint256 => uint256[]) private traitCumulativeWeights;

    // Which trait ID represents "none" for each trait type (0 = no none option)
    mapping(uint256 => uint256) public noneTraitId;

    // Trait mappings (simplified - all traits are just IDs)
    // Convention: 0 = use bodyColor for rendering, >0 = use specific trait
    mapping(uint256 => string) public bodyColor;    // Base color for body and background
    mapping(uint256 => uint256) public background;  // 0=color, 1+=special background
    mapping(uint256 => uint256) public body;        // 0=color, 1+=special skin (bronze=1, silver=2, gold=3, diamond=4)
    mapping(uint256 => uint256) public head;        // Base heads (1+) or item heads (above baseTraitCount)
    mapping(uint256 => uint256) public mouth;       // Base mouths (1+) or item mouths (above baseTraitCount)
    mapping(uint256 => uint256) public belly;       // Base bellies (1+) or item bellies (above baseTraitCount)

    // Sentinel value for "no trait" — non-zero to keep SSTORE gas costs consistent
    uint256 public constant NONE_TRAIT = type(uint256).max;

    // Trait type constants (reduced from 8 to 5)
    uint256 public constant TRAIT_BACKGROUND = 0;
    uint256 public constant TRAIT_BODY = 1;
    uint256 public constant TRAIT_HEAD = 2;
    uint256 public constant TRAIT_MOUTH = 3;
    uint256 public constant TRAIT_BELLY = 4;

    // Trait counts are now queried dynamically from svgRenderer.getTraitCount()
    // No need for hardcoded values - they're determined by what's deployed

    // Events
    event FregMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string bodyColor,
        uint256 head,
        uint256 mouth,
        uint256 belly
    );

    event TraitSet(uint256 indexed tokenId, uint256 traitType, uint256 traitValue);
    event Mutated(uint256 indexed tokenId, address indexed owner);
    event BodyColorChanged(uint256 indexed tokenId, string oldColor, string newColor);
    event MintRequested(uint256 indexed requestId, address indexed owner, string bodyColor);
    event HeadRerollRequested(uint256 indexed requestId, uint256 indexed tokenId, address indexed owner, uint256 itemTokenId);

    modifier onlyRandomizer() {
        require(address(randomizer) != address(0) && msg.sender == address(randomizer), "Only randomizer");
        _;
    }

    modifier onlyRandomizerOrItems() {
        require(
            (address(randomizer) != address(0) && msg.sender == address(randomizer)) ||
            msg.sender == itemsContract,
            "Only randomizer"
        );
        _;
    }

    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_
    )
        ERC721AC(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
        Ownable(address(msg.sender))
    {}

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");

        bool mutated = isMutated[tokenId] && address(mutationRenderer) != address(0);
        ISVGRenderer renderer = mutated ? mutationRenderer : svgRenderer;

        string memory svg = renderer.render(
            bodyColor[tokenId],
            background[tokenId],
            body[tokenId],
            head[tokenId],
            mouth[tokenId],
            belly[tokenId]
        );

        // Build attributes
        string memory attributes = _buildAttributes(tokenId, mutated);

        // Build JSON with embedded SVG (no base64 encoding)
        // SVG uses single quotes so it can be embedded in JSON double-quoted strings
        return string(
            abi.encodePacked(
                'data:application/json,{"name":"Freg #',
                Strings.toString(tokenId),
                '","description":"Fregs","image":"data:image/svg+xml,',
                svg,
                '","attributes":[',
                attributes,
                ']}'
            )
        );
    }

    function _buildAttributes(uint256 tokenId, bool mutated) internal view returns (string memory) {
        // Background: 0=use color, >0=special background
        string memory attrs;
        if (background[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                '{"trait_type": "Background","value": "',
                svgRenderer.meta(TRAIT_BACKGROUND, background[tokenId]),
                '"}'
            ));
        } else {
            attrs = string(abi.encodePacked(
                '{"trait_type": "Background","value": "',
                bodyColor[tokenId],
                '"}'
            ));
        }

        // Body: 0=use color, >0=special body skin
        if (body[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Body","value": "',
                svgRenderer.meta(TRAIT_BODY, body[tokenId]),
                '"}'
            ));
        } else {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Body","value": "',
                bodyColor[tokenId],
                '"}'
            ));
        }

        // Head: always from meta (base or item)
        attrs = string(abi.encodePacked(
            attrs,
            ',{"trait_type": "Head","value": "',
            svgRenderer.meta(TRAIT_HEAD, head[tokenId]),
            '"}'
        ));

        // Mouth: NONE_TRAIT = no mouth
        attrs = string(abi.encodePacked(
            attrs,
            ',{"trait_type": "Mouth","value": "',
            mouth[tokenId] == NONE_TRAIT ? "Normal" : svgRenderer.meta(TRAIT_MOUTH, mouth[tokenId]),
            '"}'
        ));

        // Belly: only shown when using default body (special skins cover the belly)
        if (body[tokenId] == 0) {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Belly","value": "',
                belly[tokenId] == NONE_TRAIT ? "Normal" : svgRenderer.meta(TRAIT_BELLY, belly[tokenId]),
                '"}'
            ));
        }

        if (mutated) {
            attrs = string(abi.encodePacked(attrs, ',{"trait_type": "Mutated","value": "Yes"}'));
        }

        if (itemsContract != address(0)) {
            bool claimed = IFregsItemsReader(itemsContract).hasClaimed(tokenId);
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Item Claimed","value": "',
                claimed ? "Yes" : "No",
                '"}'
            ));
        }

        return attrs;
    }

    function _validateHexColor(string memory color) internal pure {
        bytes memory b = bytes(color);
        require(b.length == 7, "Color must be #RRGGBB");
        require(b[0] == '#', "Color must start with #");
        for (uint256 i = 1; i < 7; i++) {
            bytes1 c = b[i];
            require(
                (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'),
                "Invalid hex character"
            );
        }
    }

    function mint(string memory _color) public payable nonReentrant {
        _validateHexColor(_color);
        require(address(randomizer) != address(0), "Randomizer not set");
        require(_tokenIdCounter + pendingMintCount < supply, "Max supply reached");

        bool isFree = freeMints[msg.sender] > 0;
        uint256 vrfFee = randomizer.quoteMintFee();
        uint256 requiredPayment = vrfFee;

        if (mintPhase == 0) {
            // Paused: only owner can mint
            require(msg.sender == owner(), "Minting is paused");
        } else if (mintPhase == 1) {
            // Whitelist: mint pass holders (pay ETH + burn pass) or free mint wallets
            if (!isFree) {
                // Must have a mint pass — burn it, still pay ETH
                require(mintPassContract != address(0), "Mint pass not configured");
                requiredPayment += mintPrice;
                require(msg.value >= requiredPayment, "Insufficient funds");
                IFregsMintPass(mintPassContract).burnForMint(msg.sender);
            }
        } else {
            // Public: anyone can mint, free mint wallets still free
            if (!isFree) {
                requiredPayment += mintPrice;
                require(msg.value >= requiredPayment, "Insufficient funds");
            }
        }

        if (isFree) {
            require(msg.value >= requiredPayment, "Insufficient funds");
            freeMints[msg.sender] -= 1;
        }

        pendingMintCount += 1;

        uint256 requestId = randomizer.requestMint{value: vrfFee}(msg.sender, _color);
        emit MintRequested(requestId, msg.sender, _color);

        uint256 refund = msg.value - requiredPayment;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
    }

    function quoteMintFee() external view returns (uint256) {
        require(address(randomizer) != address(0), "Randomizer not set");
        return randomizer.quoteMintFee();
    }

    // Intentionally not nonReentrant so localhost mock VRF auto-fulfill can settle in the same tx.
    function fulfillMint(address minter, string calldata _color, uint256 randomWord) external onlyRandomizer {
        require(pendingMintCount > 0, "No pending mint");

        uint256 newTokenId = _tokenIdCounter;
        pendingMintCount -= 1;

        _mint(minter, 1);
        _tokenIdCounter += 1;

        bodyColor[newTokenId] = _color;
        background[newTokenId] = 0;
        body[newTokenId] = 0;

        head[newTokenId] = _getWeightedTraitFromRandom(TRAIT_HEAD, _deriveRandom(randomWord, 0));
        uint256 mouthRoll = _getWeightedTraitFromRandom(TRAIT_MOUTH, _deriveRandom(randomWord, 1));
        mouth[newTokenId] = mouthRoll == 0 ? NONE_TRAIT : mouthRoll;
        uint256 bellyRoll = _getWeightedTraitFromRandom(TRAIT_BELLY, _deriveRandom(randomWord, 2));
        belly[newTokenId] = bellyRoll == 0 ? NONE_TRAIT : bellyRoll;

        emit FregMinted(newTokenId, minter, _color, head[newTokenId], mouth[newTokenId], belly[newTokenId]);
    }

    // Weighted trait selection using cumulative weights.
    // Returns trait ID (1-based). If the selected trait is the "none" trait for
    // this type, returns 0 instead.
    function _getWeightedTraitFromRandom(uint256 traitType, uint256 randomValue) internal view returns (uint256) {
        uint256[] storage cumWeights = traitCumulativeWeights[traitType];
        uint256 len = cumWeights.length;
        require(len > 0, "No weights set");
        uint256 totalWeight = cumWeights[len - 1];
        uint256 roll = randomValue % totalWeight;
        for (uint256 i = 0; i < len; i++) {
            if (roll < cumWeights[i]) {
                uint256 traitId = i + 1;
                return traitId == noneTraitId[traitType] ? 0 : traitId;
            }
        }
        return len; // Fallback to last trait
    }

    function _deriveRandom(uint256 randomWord, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(randomWord, salt)));
    }

    function prepareHeadReroll(uint256 tokenId, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        require(!pendingHeadReroll[tokenId], "Head reroll pending");

        pendingHeadReroll[tokenId] = true;
        pendingHeadRerollCount += 1;
    }

    function fulfillHeadReroll(address sender, uint256 tokenId, uint256 randomWord) external onlyRandomizerOrItems {
        require(pendingHeadReroll[tokenId], "No pending head reroll");
        require(ownerOf(tokenId) == sender, "Not token owner");

        pendingHeadReroll[tokenId] = false;
        pendingHeadRerollCount -= 1;
        head[tokenId] = _getWeightedTraitFromRandom(TRAIT_HEAD, randomWord);

        emit TraitSet(tokenId, TRAIT_HEAD, head[tokenId]);
    }

    // Unified setter for any trait type - called by items contract
    function setTrait(uint256 tokenId, uint256 traitType, uint256 traitValue, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");

        // Validate trait exists in renderer (dynamic check)
        require(svgRenderer.isValidTrait(traitType, traitValue), "Invalid trait");

        if (traitType == TRAIT_BACKGROUND) {
            background[tokenId] = traitValue;
        } else if (traitType == TRAIT_BODY) {
            body[tokenId] = traitValue;
        } else if (traitType == TRAIT_HEAD) {
            head[tokenId] = traitValue;
        } else if (traitType == TRAIT_MOUTH) {
            mouth[tokenId] = traitValue;
        } else if (traitType == TRAIT_BELLY) {
            belly[tokenId] = traitValue;
        } else {
            revert("Invalid trait type");
        }

        emit TraitSet(tokenId, traitType, traitValue);
    }

    // Called by items contract to permanently mutate a Freg
    function setMutated(uint256 tokenId, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        require(!isMutated[tokenId], "Already mutated");
        isMutated[tokenId] = true;
        emit Mutated(tokenId, sender);
    }

    // Called by items contract to change body color
    function setBodyColor(uint256 tokenId, string memory _color, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        _validateHexColor(_color);

        string memory oldColor = bodyColor[tokenId];
        bodyColor[tokenId] = _color;

        emit BodyColorChanged(tokenId, oldColor, _color);
    }

    // ============ Liquidity ============

    function burnForLiquidity(uint256 tokenId, address sender) external {
        require(msg.sender == liquidityContract, "Only liquidity contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        _burn(tokenId);
    }

    // ============ Owner Functions ============

    function setSVGRenderer(address _svgRenderer) public onlyOwner {
        svgRenderer = ISVGRenderer(_svgRenderer);
    }

    function setMutationRenderer(address _mutationRenderer) public onlyOwner {
        mutationRenderer = ISVGRenderer(_mutationRenderer);
    }

    function setItemsContract(address _itemsContract) public onlyOwner {
        itemsContract = _itemsContract;
    }

    function setMintPassContract(address _mintPassContract) public onlyOwner {
        mintPassContract = _mintPassContract;
    }

    function setLiquidityContract(address _liquidityContract) public onlyOwner {
        liquidityContract = _liquidityContract;
    }

    function setRandomizer(address _randomizer) public onlyOwner {
        randomizer = IFregsRandomizer(_randomizer);
    }

    function setMintPhase(uint256 _phase) public onlyOwner {
        require(_phase <= 2, "Invalid phase");
        mintPhase = _phase;
    }

    function addFreeMintWallets(address[] calldata wallets, uint256[] calldata counts) public onlyOwner {
        require(wallets.length == counts.length, "Length mismatch");
        for (uint256 i = 0; i < wallets.length; i++) {
            freeMints[wallets[i]] = counts[i];
        }
    }

    function removeFreeMintWallets(address[] calldata wallets) public onlyOwner {
        for (uint256 i = 0; i < wallets.length; i++) {
            freeMints[wallets[i]] = 0;
        }
    }

    function setMintPrice(uint256 _mintPrice) public onlyOwner {
        mintPrice = _mintPrice;
    }

    function setSupply(uint256 _supply) public onlyOwner {
        require(_supply >= _tokenIdCounter + pendingMintCount, "Below reserved supply");
        supply = _supply;
    }

    // Set weighted trait selection for a trait type.
    // weights: array of per-trait weights (index 0 = trait 1, etc.)
    // _noneTraitId: which trait ID means "none" (0 = no none option)
    function setTraitWeights(uint256 traitType, uint256[] calldata weights, uint256 _noneTraitId) public onlyOwner {
        require(pendingMintCount == 0 && pendingHeadRerollCount == 0, "Random requests pending");
        require(weights.length > 0, "Empty weights");
        require(_noneTraitId <= weights.length, "Invalid none trait");
        uint256[] storage cumWeights = traitCumulativeWeights[traitType];

        // Clear existing
        delete traitCumulativeWeights[traitType];

        uint256 cumulative = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            cumulative += weights[i];
            cumWeights.push(cumulative);
        }
        require(cumulative == 100, "Weights must sum to 100");
        noneTraitId[traitType] = _noneTraitId;
    }

    // Trait counts are now determined dynamically from svgRenderer.getTraitCount()
    // No setters needed - just deploy new traits to the SVGRouter

    function rescuePendingMintCount(uint256 amount) external onlyOwner {
        require(amount <= pendingMintCount, "Amount exceeds pending");
        pendingMintCount -= amount;
    }

    function rescuePendingHeadRerollCount(uint256 amount) external onlyOwner {
        require(amount <= pendingHeadRerollCount, "Amount exceeds pending");
        pendingHeadRerollCount -= amount;
    }

    function rescuePendingHeadRerollTokens(uint256[] calldata tokenIds) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (pendingHeadReroll[tokenIds[i]]) {
                pendingHeadReroll[tokenIds[i]] = false;
                pendingHeadRerollCount -= 1;
            }
        }
    }

    // Single-token variant called by FregsItems.rescueHeadReroll — avoids array allocation in items contract
    function clearPendingHeadReroll(uint256 tokenId) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(pendingHeadReroll[tokenId], "No pending head reroll");
        pendingHeadReroll[tokenId] = false;
        pendingHeadRerollCount -= 1;
    }

    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner()).transfer(_amount);
    }

    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        if (from != address(0)) {
            for (uint256 i = 0; i < quantity; i++) {
                require(!pendingHeadReroll[startTokenId + i], "Pending head reroll");
            }
        }

        super._beforeTokenTransfers(from, to, startTokenId, quantity);
    }

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getTokenPage(uint256 cursor, uint256 limit, bool includeBurned)
        external
        view
        returns (
            uint256[] memory tokenIds,
            bool[] memory existsFlags,
            uint256 nextCursor,
            uint256 liveSupply,
            uint256 totalMinted_
        )
    {
        totalMinted_ = _tokenIdCounter;
        liveSupply = totalSupply();

        if (cursor >= totalMinted_ || limit == 0) {
            return (
                new uint256[](0),
                new bool[](0),
                totalMinted_,
                liveSupply,
                totalMinted_
            );
        }

        uint256 maxResultSize = totalMinted_ - cursor;
        if (maxResultSize > limit) {
            maxResultSize = limit;
        }

        tokenIds = new uint256[](maxResultSize);
        existsFlags = new bool[](maxResultSize);

        uint256 count = 0;
        uint256 index = cursor;

        while (index < totalMinted_ && count < limit) {
            bool exists_ = _exists(index);
            if (exists_ || includeBurned) {
                tokenIds[count] = index;
                existsFlags[count] = exists_;
                count++;
            }
            index++;
        }

        assembly {
            mstore(tokenIds, count)
            mstore(existsFlags, count)
        }

        nextCursor = index;
    }

    function getAllTokenIds() external view returns (uint256[] memory tokenIds) {
        uint256 totalMinted_ = _tokenIdCounter;
        uint256 liveSupply = totalSupply();

        tokenIds = new uint256[](liveSupply);
        uint256 count = 0;

        for (uint256 i = 0; i < totalMinted_; i++) {
            if (_exists(i)) {
                tokenIds[count] = i;
                count++;
            }
        }

        assembly {
            mstore(tokenIds, count)
        }
    }

    function getBurnedTokenIds() external view returns (uint256[] memory tokenIds) {
        uint256 totalMinted_ = _tokenIdCounter;
        uint256 burnedCount = totalMinted_ - totalSupply();

        tokenIds = new uint256[](burnedCount);
        uint256 count = 0;

        for (uint256 i = 0; i < totalMinted_; i++) {
            if (!_exists(i)) {
                tokenIds[count] = i;
                count++;
            }
        }

        assembly {
            mstore(tokenIds, count)
        }
    }

    function getFregDataBatch(uint256[] calldata tokenIds_)
        external
        view
        returns (
            string[] memory bodyColors,
            uint256[] memory backgrounds,
            uint256[] memory bodies,
            uint256[] memory heads,
            uint256[] memory mouths,
            uint256[] memory bellies
        )
    {
        uint256 length = tokenIds_.length;
        bodyColors = new string[](length);
        backgrounds = new uint256[](length);
        bodies = new uint256[](length);
        heads = new uint256[](length);
        mouths = new uint256[](length);
        bellies = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = tokenIds_[i];
            require(_exists(tokenId), "Token does not exist");

            bodyColors[i] = bodyColor[tokenId];
            backgrounds[i] = background[tokenId];
            bodies[i] = body[tokenId];
            heads[i] = head[tokenId];
            mouths[i] = mouth[tokenId] == NONE_TRAIT ? 0 : mouth[tokenId];
            bellies[i] = belly[tokenId] == NONE_TRAIT ? 0 : belly[tokenId];
        }
    }

    function getOwnedFregs(address owner)
        external
        view
        returns (
            uint256[] memory tokenIds,
            string[] memory bodyColors,
            uint256[] memory backgrounds,
            uint256[] memory bodies,
            uint256[] memory heads,
            uint256[] memory mouths,
            uint256[] memory bellies
        )
    {
        uint256 tokenCount = balanceOf(owner);
        if (tokenCount == 0) {
            return (
                new uint256[](0),
                new string[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }

        tokenIds = new uint256[](tokenCount);
        bodyColors = new string[](tokenCount);
        backgrounds = new uint256[](tokenCount);
        bodies = new uint256[](tokenCount);
        heads = new uint256[](tokenCount);
        mouths = new uint256[](tokenCount);
        bellies = new uint256[](tokenCount);

        uint256 index = 0;
        for (uint256 i = 0; i < _tokenIdCounter && index < tokenCount; i++) {
            if (_exists(i) && ownerOf(i) == owner) {
                tokenIds[index] = i;
                bodyColors[index] = bodyColor[i];
                backgrounds[index] = background[i];
                bodies[index] = body[i];
                heads[index] = head[i];
                mouths[index] = mouth[i];
                bellies[index] = belly[i];
                index++;
            }
        }

        return (tokenIds, bodyColors, backgrounds, bodies, heads, mouths, bellies);
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
