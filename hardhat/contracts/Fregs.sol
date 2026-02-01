// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface ISVGRenderer {
    // Renders full SVG - handles special trait logic internally
    // Background uses same color as bodyColor (unless specialBackground is set)
    function render(
        string memory _bodyColor,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly,
        uint256 _specialBody,
        uint256 _specialMouth,
        uint256 _specialBackground,
        uint256 _specialBelly,
        uint256 _specialHead
    ) external view returns (string memory);

    // Get trait name for metadata
    function meta(uint256 _traitType, uint256 _traitId) external view returns (string memory);

    // Get the number of registered traits for a trait type
    function getTraitCount(uint256 _traitType) external view returns (uint256);

    // Check if a trait ID is valid for a given trait type
    function isValidTrait(uint256 _traitType, uint256 _traitId) external view returns (bool);
}

contract Fregs is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    ISVGRenderer public svgRenderer;

    uint256 private _tokenIdCounter;
    uint256 private randomNonce;

    uint256 public mintPrice = 0.001 ether;
    uint256 public supply = 3000;
    address public itemsContract;
    address public mintPassContract;

    // Trait mappings
    mapping(uint256 => string) public bodyColor; // Also used for background color
    mapping(uint256 => uint256) public head;
    mapping(uint256 => uint256) public mouth;
    mapping(uint256 => uint256) public belly;
    mapping(uint256 => uint256) public specialBody;      // 0=none, 1=bronze, 2=silver, 3=gold (renamed from specialSkin)
    mapping(uint256 => uint256) public specialMouth;     // 0=none, 1+=variant
    mapping(uint256 => uint256) public specialBackground; // 0=none, 1+=variant
    mapping(uint256 => uint256) public specialBelly;     // 0=none, 1+=variant
    mapping(uint256 => uint256) public specialHead;      // 0=none, 1+=variant

    // Trait type constants for meta() calls
    uint256 public constant TRAIT_HEAD = 1;
    uint256 public constant TRAIT_MOUTH = 2;
    uint256 public constant TRAIT_BELLY = 3;
    uint256 public constant TRAIT_SPECIAL_BODY = 4;       // renamed from TRAIT_SPECIAL_SKIN
    uint256 public constant TRAIT_SPECIAL_MOUTH = 5;
    uint256 public constant TRAIT_SPECIAL_BACKGROUND = 6;
    uint256 public constant TRAIT_SPECIAL_BELLY = 7;
    uint256 public constant TRAIT_SPECIAL_HEAD = 8;

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

    event HeadRerolled(uint256 indexed tokenId, uint256 oldHead, uint256 newHead);
    event SpecialBodyApplied(uint256 indexed tokenId, uint256 specialBody);
    event SpecialTraitApplied(uint256 indexed tokenId, uint256 traitType, uint256 traitValue);
    event BodyColorChanged(uint256 indexed tokenId, string oldColor, string newColor);

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

        string memory svg = svgRenderer.render(
            bodyColor[tokenId],
            head[tokenId],
            mouth[tokenId],
            belly[tokenId],
            specialBody[tokenId],
            specialMouth[tokenId],
            specialBackground[tokenId],
            specialBelly[tokenId],
            specialHead[tokenId]
        );

        // Build attributes based on which special traits are active
        string memory attributes = _buildAttributes(tokenId);

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

    function _buildAttributes(uint256 tokenId) internal view returns (string memory) {
        // Start with background
        string memory attrs;

        if (specialBackground[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                '{"trait_type": "Background","value": "',
                svgRenderer.meta(TRAIT_SPECIAL_BACKGROUND, specialBackground[tokenId]),
                '"}'
            ));
        } else {
            attrs = string(abi.encodePacked(
                '{"trait_type": "Background","value": "',
                bodyColor[tokenId],
                '"}'
            ));
        }

        // Body or Special Body
        if (specialBody[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Body","value": "',
                svgRenderer.meta(TRAIT_SPECIAL_BODY, specialBody[tokenId]),
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

        // Head or Special Head
        if (specialHead[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Head","value": "',
                svgRenderer.meta(TRAIT_SPECIAL_HEAD, specialHead[tokenId]),
                '"}'
            ));
        } else {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Head","value": "',
                svgRenderer.meta(TRAIT_HEAD, head[tokenId]),
                '"}'
            ));
        }

        // Mouth or Special Mouth
        if (specialMouth[tokenId] > 0) {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Mouth","value": "',
                svgRenderer.meta(TRAIT_SPECIAL_MOUTH, specialMouth[tokenId]),
                '"}'
            ));
        } else {
            attrs = string(abi.encodePacked(
                attrs,
                ',{"trait_type": "Mouth","value": "',
                svgRenderer.meta(TRAIT_MOUTH, mouth[tokenId]),
                '"}'
            ));
        }

        // Belly or Special Belly (only show if no special body)
        if (specialBody[tokenId] == 0) {
            if (specialBelly[tokenId] > 0) {
                attrs = string(abi.encodePacked(
                    attrs,
                    ',{"trait_type": "Belly","value": "',
                    svgRenderer.meta(TRAIT_SPECIAL_BELLY, specialBelly[tokenId]),
                    '"}'
                ));
            } else {
                attrs = string(abi.encodePacked(
                    attrs,
                    ',{"trait_type": "Belly","value": "',
                    svgRenderer.meta(TRAIT_BELLY, belly[tokenId]),
                    '"}'
                ));
            }
        }

        return attrs;
    }

    function mint(string memory _color) public payable nonReentrant {
        require(msg.value >= mintPrice, "Insufficient funds");
        require(_tokenIdCounter < supply, "Max supply reached");

        uint256 newTokenId = _tokenIdCounter;
        _safeMint(msg.sender, 1);
        _tokenIdCounter += 1;

        // Store body color (also used for background)
        bodyColor[newTokenId] = _color;

        // Assign random traits (1-indexed, 0 means no trait)
        // Trait counts are queried dynamically from the renderer
        head[newTokenId] = _getRandom(svgRenderer.getTraitCount(TRAIT_HEAD)) + 1;
        mouth[newTokenId] = _getRandom(svgRenderer.getTraitCount(TRAIT_MOUTH)) + 1;
        belly[newTokenId] = _getRandom(svgRenderer.getTraitCount(TRAIT_BELLY)) + 1;
        // All special traits default to 0 (none)
        specialBody[newTokenId] = 0;
        specialMouth[newTokenId] = 0;
        specialBackground[newTokenId] = 0;
        specialBelly[newTokenId] = 0;
        specialHead[newTokenId] = 0;

        emit FregMinted(
            newTokenId,
            msg.sender,
            _color,
            head[newTokenId],
            mouth[newTokenId],
            belly[newTokenId]
        );
    }

    // Called by mint pass contract for free mints
    function freeMint(string memory _color, address _sender) external nonReentrant {
        require(msg.sender == mintPassContract, "Only mint pass contract");
        require(_tokenIdCounter < supply, "Max supply reached");

        uint256 newTokenId = _tokenIdCounter;
        _safeMint(_sender, 1);
        _tokenIdCounter += 1;

        // Store body color (also used for background)
        bodyColor[newTokenId] = _color;

        // Assign random traits (1-indexed, 0 means no trait)
        // Trait counts are queried dynamically from the renderer
        head[newTokenId] = _getRandomForAddress(svgRenderer.getTraitCount(TRAIT_HEAD), _sender) + 1;
        mouth[newTokenId] = _getRandomForAddress(svgRenderer.getTraitCount(TRAIT_MOUTH), _sender) + 1;
        belly[newTokenId] = _getRandomForAddress(svgRenderer.getTraitCount(TRAIT_BELLY), _sender) + 1;
        // All special traits default to 0 (none)
        specialBody[newTokenId] = 0;
        specialMouth[newTokenId] = 0;
        specialBackground[newTokenId] = 0;
        specialBelly[newTokenId] = 0;
        specialHead[newTokenId] = 0;

        emit FregMinted(
            newTokenId,
            _sender,
            _color,
            head[newTokenId],
            mouth[newTokenId],
            belly[newTokenId]
        );
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

    function _getRandomForAddress(uint256 max, address _addr) internal returns (uint256) {
        randomNonce++;
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        _addr,
                        randomNonce,
                        _tokenIdCounter
                    )
                )
            ) % max;
    }

    // Called by items contract to reroll head trait
    function rerollHead(uint256 tokenId, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");

        uint256 oldHead = head[tokenId];
        randomNonce++;
        head[tokenId] = (uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    sender,
                    randomNonce,
                    tokenId
                )
            )
        ) % svgRenderer.getTraitCount(TRAIT_HEAD)) + 1;

        emit HeadRerolled(tokenId, oldHead, head[tokenId]);
    }

    // Called by items contract to set special body (bronze/silver/gold)
    function setSpecialBody(uint256 tokenId, uint256 _specialBody, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        require(_specialBody >= 1 && svgRenderer.isValidTrait(TRAIT_SPECIAL_BODY, _specialBody), "Invalid special body");

        specialBody[tokenId] = _specialBody;

        emit SpecialBodyApplied(tokenId, _specialBody);
    }

    // Generic setter for any special trait type - called by items contract
    function setSpecialTrait(uint256 tokenId, uint256 traitType, uint256 traitValue, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        require(traitValue >= 1, "Invalid trait value");

        // Validate trait exists in renderer (dynamic check)
        require(svgRenderer.isValidTrait(traitType, traitValue), "Invalid trait");

        if (traitType == TRAIT_SPECIAL_BODY) {
            specialBody[tokenId] = traitValue;
        } else if (traitType == TRAIT_SPECIAL_MOUTH) {
            specialMouth[tokenId] = traitValue;
        } else if (traitType == TRAIT_SPECIAL_BACKGROUND) {
            specialBackground[tokenId] = traitValue;
        } else if (traitType == TRAIT_SPECIAL_BELLY) {
            specialBelly[tokenId] = traitValue;
        } else if (traitType == TRAIT_SPECIAL_HEAD) {
            specialHead[tokenId] = traitValue;
        } else {
            revert("Invalid trait type");
        }

        emit SpecialTraitApplied(tokenId, traitType, traitValue);
    }

    // Called by items contract to change body color
    function setBodyColor(uint256 tokenId, string memory _color, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");

        string memory oldColor = bodyColor[tokenId];
        bodyColor[tokenId] = _color;

        emit BodyColorChanged(tokenId, oldColor, _color);
    }

    // ============ Owner Functions ============

    function setSVGRenderer(address _svgRenderer) public onlyOwner {
        svgRenderer = ISVGRenderer(_svgRenderer);
    }

    function setItemsContract(address _itemsContract) public onlyOwner {
        itemsContract = _itemsContract;
    }

    function setMintPassContract(address _mintPassContract) public onlyOwner {
        mintPassContract = _mintPassContract;
    }

    function setMintPrice(uint256 _mintPrice) public onlyOwner {
        mintPrice = _mintPrice;
    }

    function setSupply(uint256 _supply) public onlyOwner {
        supply = _supply;
    }

    // Trait counts are now determined dynamically from svgRenderer.getTraitCount()
    // No setters needed - just deploy new traits to the SVGRouter

    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner()).transfer(_amount);
    }

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getOwnedFregs(address owner)
        external
        view
        returns (
            uint256[] memory tokenIds,
            string[] memory bodyColors,
            uint256[] memory heads,
            uint256[] memory mouths,
            uint256[] memory bellies,
            uint256[] memory specialBodies,
            uint256[] memory specialMouths,
            uint256[] memory specialBackgrounds,
            uint256[] memory specialBellies,
            uint256[] memory specialHeads
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
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }

        tokenIds = new uint256[](tokenCount);
        bodyColors = new string[](tokenCount);
        heads = new uint256[](tokenCount);
        mouths = new uint256[](tokenCount);
        bellies = new uint256[](tokenCount);
        specialBodies = new uint256[](tokenCount);
        specialMouths = new uint256[](tokenCount);
        specialBackgrounds = new uint256[](tokenCount);
        specialBellies = new uint256[](tokenCount);
        specialHeads = new uint256[](tokenCount);

        uint256 index = 0;
        for (uint256 i = 0; i < _tokenIdCounter && index < tokenCount; i++) {
            if (_exists(i) && ownerOf(i) == owner) {
                tokenIds[index] = i;
                bodyColors[index] = bodyColor[i];
                heads[index] = head[i];
                mouths[index] = mouth[i];
                bellies[index] = belly[i];
                specialBodies[index] = specialBody[i];
                specialMouths[index] = specialMouth[i];
                specialBackgrounds[index] = specialBackground[i];
                specialBellies[index] = specialBelly[i];
                specialHeads[index] = specialHead[i];
                index++;
            }
        }

        return (tokenIds, bodyColors, heads, mouths, bellies, specialBodies, specialMouths, specialBackgrounds, specialBellies, specialHeads);
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
