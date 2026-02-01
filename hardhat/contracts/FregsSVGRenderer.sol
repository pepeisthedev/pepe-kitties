// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

// Interface for trait sub-contracts (SVGRouter)
interface ISVGTraitRenderer {
    function render(uint256 traitId) external view returns (string memory);
    function renderWithColor(string memory color) external view returns (string memory);
    function meta(uint256 traitId) external view returns (string memory);
    function getTraitCount() external view returns (uint256);
    function isValidTrait(uint256 traitId) external view returns (bool);
}

contract FregsSVGRenderer is Ownable {
    // Trait type constants (must match Fregs.sol) - reduced from 8 to 5
    uint256 public constant TRAIT_BACKGROUND = 0;
    uint256 public constant TRAIT_BODY = 1;
    uint256 public constant TRAIT_HEAD = 2;
    uint256 public constant TRAIT_MOUTH = 3;
    uint256 public constant TRAIT_BELLY = 4;

    // Unified sub-contracts (reduced from 9 to 5)
    // Each handles both base traits and item traits in one router
    ISVGTraitRenderer public backgroundContract;  // ID 0 = color rect, ID 1+ = special backgrounds
    ISVGTraitRenderer public bodyContract;        // ID 0 = color body, ID 1+ = special skins
    ISVGTraitRenderer public headContract;        // All heads (base + item) in one router
    ISVGTraitRenderer public mouthContract;       // All mouths in one router
    ISVGTraitRenderer public bellyContract;       // All bellies in one router

    // Base trait counts - tracks how many base traits exist per type (for mint randomization)
    // Item traits get IDs above the base count
    mapping(uint256 => uint256) public baseTraitCount;

    // SVG dimensions and styling (viewBox matches background/1.svg dimensions)
    string public svgHeader = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 617.49 644.18'>";
    string public svgFooter = "</svg>";

    constructor() Ownable(msg.sender) {}

    // ============ Main Render Function ============

    /**
     * @notice Renders the complete SVG for a Freg
     * @dev Renders layers in order: background, body, belly, head, mouth
     *      - background: 0 = use bodyColor rect, >0 = special background
     *      - body: 0 = use bodyColor body, >0 = special skin (bronze=1, silver=2, gold=3, diamond=4)
     *      - head/mouth/belly: always render from their contracts (base or item traits)
     *      Belly always renders (removed special body hiding)
     */
    function render(
        string memory _bodyColor,
        uint256 _background,
        uint256 _body,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly
    ) external view returns (string memory) {
        // Background layer - 0 = color rect, >0 = special background
        string memory backgroundLayer;
        if (_background > 0) {
            backgroundLayer = backgroundContract.render(_background);
        } else {
            backgroundLayer = _renderColorBackground(_bodyColor);
        }

        // Body layer - 0 = color body, >0 = special skin
        string memory bodyLayer;
        if (_body > 0) {
            bodyLayer = bodyContract.render(_body);
        } else {
            bodyLayer = bodyContract.renderWithColor(_bodyColor);
        }

        // Belly always renders (removed special body check)
        string memory bellyLayer = bellyContract.render(_belly);

        // Head and mouth always from their contracts
        string memory headLayer = headContract.render(_head);
        string memory mouthLayer = mouthContract.render(_mouth);

        return string(
            abi.encodePacked(
                svgHeader,
                backgroundLayer,
                bodyLayer,
                bellyLayer,
                headLayer,
                mouthLayer,
                svgFooter
            )
        );
    }

    // ============ Trait Metadata ============

    /**
     * @notice Get the name of a trait for metadata
     * @param _traitType The type of trait (TRAIT_BACKGROUND, TRAIT_BODY, etc.)
     * @param _traitId The specific trait ID
     */
    function meta(uint256 _traitType, uint256 _traitId) external view returns (string memory) {
        if (_traitType == TRAIT_BACKGROUND) {
            return backgroundContract.meta(_traitId);
        } else if (_traitType == TRAIT_BODY) {
            return bodyContract.meta(_traitId);
        } else if (_traitType == TRAIT_HEAD) {
            return headContract.meta(_traitId);
        } else if (_traitType == TRAIT_MOUTH) {
            return mouthContract.meta(_traitId);
        } else if (_traitType == TRAIT_BELLY) {
            return bellyContract.meta(_traitId);
        }
        revert("Invalid trait type");
    }

    // ============ Internal Render Helpers ============

    function _renderColorBackground(string memory _color) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<rect width='100%' height='100%' fill='",
                _color,
                "' opacity='0.3'/>"
            )
        );
    }

    // ============ Owner Functions ============

    function setBackgroundContract(address _contract) external onlyOwner {
        backgroundContract = ISVGTraitRenderer(_contract);
    }

    function setBodyContract(address _contract) external onlyOwner {
        bodyContract = ISVGTraitRenderer(_contract);
    }

    function setHeadContract(address _contract) external onlyOwner {
        headContract = ISVGTraitRenderer(_contract);
    }

    function setMouthContract(address _contract) external onlyOwner {
        mouthContract = ISVGTraitRenderer(_contract);
    }

    function setBellyContract(address _contract) external onlyOwner {
        bellyContract = ISVGTraitRenderer(_contract);
    }

    function setSVGHeader(string memory _header) external onlyOwner {
        svgHeader = _header;
    }

    function setSVGFooter(string memory _footer) external onlyOwner {
        svgFooter = _footer;
    }

    // Set all contracts at once
    function setAllContracts(
        address _background,
        address _body,
        address _head,
        address _mouth,
        address _belly
    ) external onlyOwner {
        backgroundContract = ISVGTraitRenderer(_background);
        bodyContract = ISVGTraitRenderer(_body);
        headContract = ISVGTraitRenderer(_head);
        mouthContract = ISVGTraitRenderer(_mouth);
        bellyContract = ISVGTraitRenderer(_belly);
    }

    // Set base trait count for a trait type (used for mint randomization)
    function setBaseTraitCount(uint256 _traitType, uint256 _count) external onlyOwner {
        baseTraitCount[_traitType] = _count;
    }

    // Set all base trait counts at once
    function setAllBaseTraitCounts(
        uint256 _head,
        uint256 _mouth,
        uint256 _belly
    ) external onlyOwner {
        baseTraitCount[TRAIT_HEAD] = _head;
        baseTraitCount[TRAIT_MOUTH] = _mouth;
        baseTraitCount[TRAIT_BELLY] = _belly;
    }

    // ============ Dynamic Trait Count Functions ============

    /**
     * @notice Get the number of base traits for a trait type (for mint randomization)
     * @param _traitType The type of trait (TRAIT_HEAD, TRAIT_MOUTH, TRAIT_BELLY)
     * @return count The number of base traits (item traits are above this count)
     */
    function getBaseTraitCount(uint256 _traitType) external view returns (uint256) {
        return baseTraitCount[_traitType];
    }

    /**
     * @notice Get the total number of registered traits for a trait type
     * @param _traitType The type of trait
     * @return count The total number of traits (base + items)
     */
    function getTotalTraitCount(uint256 _traitType) external view returns (uint256) {
        if (_traitType == TRAIT_BACKGROUND && address(backgroundContract) != address(0)) {
            return backgroundContract.getTraitCount();
        } else if (_traitType == TRAIT_BODY && address(bodyContract) != address(0)) {
            return bodyContract.getTraitCount();
        } else if (_traitType == TRAIT_HEAD && address(headContract) != address(0)) {
            return headContract.getTraitCount();
        } else if (_traitType == TRAIT_MOUTH && address(mouthContract) != address(0)) {
            return mouthContract.getTraitCount();
        } else if (_traitType == TRAIT_BELLY && address(bellyContract) != address(0)) {
            return bellyContract.getTraitCount();
        }
        return 0;
    }

    /**
     * @notice Check if a trait ID is valid for a given trait type
     * @param _traitType The type of trait
     * @param _traitId The trait ID to check
     * @return valid True if the trait exists and has a renderer
     */
    function isValidTrait(uint256 _traitType, uint256 _traitId) external view returns (bool) {
        if (_traitType == TRAIT_BACKGROUND && address(backgroundContract) != address(0)) {
            return backgroundContract.isValidTrait(_traitId);
        } else if (_traitType == TRAIT_BODY && address(bodyContract) != address(0)) {
            return bodyContract.isValidTrait(_traitId);
        } else if (_traitType == TRAIT_HEAD && address(headContract) != address(0)) {
            return headContract.isValidTrait(_traitId);
        } else if (_traitType == TRAIT_MOUTH && address(mouthContract) != address(0)) {
            return mouthContract.isValidTrait(_traitId);
        } else if (_traitType == TRAIT_BELLY && address(bellyContract) != address(0)) {
            return bellyContract.isValidTrait(_traitId);
        }
        return false;
    }
}
