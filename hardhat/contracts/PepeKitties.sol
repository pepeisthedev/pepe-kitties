// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface ISVGRenderer {
    // Renders full SVG - handles specialSkin logic internally
    function render(
        string memory _bodyColor,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly,
        uint256 _specialSkin
    ) external view returns (string memory);

    // Get trait name for metadata
    function meta(uint256 _traitType, uint256 _traitId) external view returns (string memory);
}

contract PepeKitties is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    ISVGRenderer public svgRenderer;

    uint256 private _tokenIdCounter;
    uint256 private randomNonce;

    uint256 public mintPrice = 0.001 ether;
    uint256 public supply = 3000;
    address public itemsContract;
    address public mintPassContract;

    // Trait mappings
    mapping(uint256 => string) public bodyColor;
    mapping(uint256 => uint256) public head;
    mapping(uint256 => uint256) public mouth;
    mapping(uint256 => uint256) public belly;
    mapping(uint256 => uint256) public specialSkin; // 0=none, 1=bronze, 2=silver, 3=gold

    // Trait type constants for meta() calls
    uint256 public constant TRAIT_HEAD = 1;
    uint256 public constant TRAIT_MOUTH = 2;
    uint256 public constant TRAIT_BELLY = 3;
    uint256 public constant TRAIT_SPECIAL_SKIN = 4;

    // Trait count configuration (for randomness ranges)
    uint256 public headTraitCount = 10;
    uint256 public mouthTraitCount = 8;
    uint256 public bellyTraitCount = 6;

    // Events
    event KittyMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string bodyColor,
        uint256 head,
        uint256 mouth,
        uint256 belly
    );

    event HeadRerolled(uint256 indexed tokenId, uint256 oldHead, uint256 newHead);
    event SpecialSkinApplied(uint256 indexed tokenId, uint256 specialSkin);
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

    function _baseURI() internal pure override returns (string memory) {
        return "data:application/json;base64,";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");

        string memory svg = svgRenderer.render(
            bodyColor[tokenId],
            head[tokenId],
            mouth[tokenId],
            belly[tokenId],
            specialSkin[tokenId]
        );

        string memory attributes;

        if (specialSkin[tokenId] > 0) {
            // Has special skin - don't show body color or belly (they're replaced)
            attributes = string(
                abi.encodePacked(
                    '{"trait_type": "Special Skin","value": "',
                    _getSpecialSkinName(specialSkin[tokenId]),
                    '"},{"trait_type": "Head","value": "',
                    svgRenderer.meta(TRAIT_HEAD, head[tokenId]),
                    '"},{"trait_type": "Mouth","value": "',
                    svgRenderer.meta(TRAIT_MOUTH, mouth[tokenId]),
                    '"}'
                )
            );
        } else {
            // No special skin - show body color and belly
            attributes = string(
                abi.encodePacked(
                    '{"trait_type": "Body Color","value": "',
                    bodyColor[tokenId],
                    '"},{"trait_type": "Head","value": "',
                    svgRenderer.meta(TRAIT_HEAD, head[tokenId]),
                    '"},{"trait_type": "Mouth","value": "',
                    svgRenderer.meta(TRAIT_MOUTH, mouth[tokenId]),
                    '"},{"trait_type": "Belly","value": "',
                    svgRenderer.meta(TRAIT_BELLY, belly[tokenId]),
                    '"}'
                )
            );
        }

        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Pepe Kitty #',
                        Strings.toString(tokenId),
                        '","description": "Pepe Kitties - Customizable NFT Frogs on Base","image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '","attributes": [',
                        attributes,
                        ']}'
                    )
                )
            )
        );

        return string(abi.encodePacked(_baseURI(), json));
    }

    function _getSpecialSkinName(uint256 _specialSkin) internal pure returns (string memory) {
        if (_specialSkin == 1) return "Bronze";
        if (_specialSkin == 2) return "Silver";
        if (_specialSkin == 3) return "Gold";
        return "None";
    }

    function mint(string memory _color) public payable nonReentrant {
        require(msg.value >= mintPrice, "Insufficient funds");
        require(_tokenIdCounter < supply, "Max supply reached");

        uint256 newTokenId = _tokenIdCounter;
        _safeMint(msg.sender, 1);
        _tokenIdCounter += 1;

        // Store body color
        bodyColor[newTokenId] = _color;

        // Assign random traits (1-indexed, 0 means no trait)
        head[newTokenId] = _getRandom(headTraitCount) + 1;
        mouth[newTokenId] = _getRandom(mouthTraitCount) + 1;
        belly[newTokenId] = _getRandom(bellyTraitCount) + 1;
        specialSkin[newTokenId] = 0; // No special skin by default

        emit KittyMinted(
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

        // Store body color
        bodyColor[newTokenId] = _color;

        // Assign random traits (1-indexed, 0 means no trait)
        head[newTokenId] = _getRandomForAddress(headTraitCount, _sender) + 1;
        mouth[newTokenId] = _getRandomForAddress(mouthTraitCount, _sender) + 1;
        belly[newTokenId] = _getRandomForAddress(bellyTraitCount, _sender) + 1;
        specialSkin[newTokenId] = 0; // No special skin by default

        emit KittyMinted(
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
        ) % headTraitCount) + 1;

        emit HeadRerolled(tokenId, oldHead, head[tokenId]);
    }

    // Called by items contract to set special skin
    function setSpecialSkin(uint256 tokenId, uint256 _specialSkin, address sender) external {
        require(msg.sender == itemsContract, "Only items contract");
        require(ownerOf(tokenId) == sender, "Not token owner");
        require(_specialSkin >= 1 && _specialSkin <= 3, "Invalid special skin");

        specialSkin[tokenId] = _specialSkin;

        emit SpecialSkinApplied(tokenId, _specialSkin);
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

    function setHeadTraitCount(uint256 _count) public onlyOwner {
        headTraitCount = _count;
    }

    function setMouthTraitCount(uint256 _count) public onlyOwner {
        mouthTraitCount = _count;
    }

    function setBellyTraitCount(uint256 _count) public onlyOwner {
        bellyTraitCount = _count;
    }

    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner()).transfer(_amount);
    }

    // ============ View Functions ============

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    function getOwnedKitties(address owner)
        external
        view
        returns (
            uint256[] memory tokenIds,
            string[] memory bodyColors,
            uint256[] memory heads,
            uint256[] memory mouths,
            uint256[] memory bellies,
            uint256[] memory specialSkins
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
                new uint256[](0)
            );
        }

        tokenIds = new uint256[](tokenCount);
        bodyColors = new string[](tokenCount);
        heads = new uint256[](tokenCount);
        mouths = new uint256[](tokenCount);
        bellies = new uint256[](tokenCount);
        specialSkins = new uint256[](tokenCount);

        uint256 index = 0;
        for (uint256 i = 0; i < _tokenIdCounter && index < tokenCount; i++) {
            if (_exists(i) && ownerOf(i) == owner) {
                tokenIds[index] = i;
                bodyColors[index] = bodyColor[i];
                heads[index] = head[i];
                mouths[index] = mouth[i];
                bellies[index] = belly[i];
                specialSkins[index] = specialSkin[i];
                index++;
            }
        }

        return (tokenIds, bodyColors, heads, mouths, bellies, specialSkins);
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
