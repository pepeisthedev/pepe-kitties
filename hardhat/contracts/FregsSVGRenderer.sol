// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

// Interface for trait sub-contracts
interface ISVGTraitRenderer {
    function render(uint256 traitId) external view returns (string memory);
    function renderWithColor(string memory color) external view returns (string memory);
    function meta(uint256 traitId) external view returns (string memory);
}

contract FregsSVGRenderer is Ownable {
    // Trait type constants (must match Fregs.sol)
    uint256 public constant TRAIT_HEAD = 1;
    uint256 public constant TRAIT_MOUTH = 2;
    uint256 public constant TRAIT_BELLY = 3;
    uint256 public constant TRAIT_SPECIAL_SKIN = 4;

    // Sub-contracts for each trait type
    ISVGTraitRenderer public bodyContract;
    ISVGTraitRenderer public bellyContract;
    ISVGTraitRenderer public headContract;
    ISVGTraitRenderer public mouthContract;
    ISVGTraitRenderer public specialSkinContract;

    // SVG dimensions and styling (viewBox matches background/1.svg dimensions)
    string public svgHeader = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 617.49 644.18'>";
    string public svgFooter = "</svg>";

    constructor() Ownable(msg.sender) {}

    // ============ Main Render Function ============

    /**
     * @notice Renders the complete SVG for a Freg
     * @dev Renders: background (with color) + body layers + head + mouth
     *      If specialSkin > 0, renders: background + special_skin + head + mouth
     *      Otherwise renders: background + body (with color) + belly + head + mouth
     */
    function render(
        string memory _bodyColor,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly,
        uint256 _specialSkin
    ) external view returns (string memory) {
        // Background layer - uses same color as body with 30% opacity
        string memory backgroundLayer = _renderBackground(_bodyColor);

        string memory bodyLayer;
        string memory bellyLayer;

        if (_specialSkin > 0) {
            // Has special skin - use special skin instead of body+belly
            bodyLayer = _renderSpecialSkin(_specialSkin);
            bellyLayer = ""; // No belly with special skin
        } else {
            // Normal render - body with color + belly
            bodyLayer = _renderBody(_bodyColor);
            bellyLayer = _renderBelly(_belly);
        }

        string memory headLayer = _renderHead(_head);
        string memory mouthLayer = _renderMouth(_mouth);

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
     * @param _traitType The type of trait (TRAIT_HEAD, TRAIT_MOUTH, etc.)
     * @param _traitId The specific trait ID
     */
    function meta(uint256 _traitType, uint256 _traitId) external view returns (string memory) {
        if (_traitType == TRAIT_HEAD) {
            return headContract.meta(_traitId);
        } else if (_traitType == TRAIT_MOUTH) {
            return mouthContract.meta(_traitId);
        } else if (_traitType == TRAIT_BELLY) {
            return bellyContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_SKIN) {
            return specialSkinContract.meta(_traitId);
        }
        revert("Invalid trait type");
    }

    // ============ Internal Render Helpers ============

    function _renderBackground(string memory _color) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<rect width='100%' height='100%' fill='",
                _color,
                "' opacity='0.3'/>"
            )
        );
    }

    function _renderBody(string memory _color) internal view returns (string memory) {
        return bodyContract.renderWithColor(_color);
    }

    function _renderBelly(uint256 _bellyId) internal view returns (string memory) {
        return bellyContract.render(_bellyId);
    }

    function _renderHead(uint256 _headId) internal view returns (string memory) {
        return headContract.render(_headId);
    }

    function _renderMouth(uint256 _mouthId) internal view returns (string memory) {
        return mouthContract.render(_mouthId);
    }

    function _renderSpecialSkin(uint256 _skinId) internal view returns (string memory) {
        return specialSkinContract.render(_skinId);
    }

    // ============ Owner Functions ============

    function setBodyContract(address _contract) external onlyOwner {
        bodyContract = ISVGTraitRenderer(_contract);
    }

    function setBellyContract(address _contract) external onlyOwner {
        bellyContract = ISVGTraitRenderer(_contract);
    }

    function setHeadContract(address _contract) external onlyOwner {
        headContract = ISVGTraitRenderer(_contract);
    }

    function setMouthContract(address _contract) external onlyOwner {
        mouthContract = ISVGTraitRenderer(_contract);
    }

    function setSpecialSkinContract(address _contract) external onlyOwner {
        specialSkinContract = ISVGTraitRenderer(_contract);
    }

    function setSVGHeader(string memory _header) external onlyOwner {
        svgHeader = _header;
    }

    function setSVGFooter(string memory _footer) external onlyOwner {
        svgFooter = _footer;
    }

    // Set all contracts at once
    function setAllContracts(
        address _body,
        address _belly,
        address _head,
        address _mouth,
        address _specialSkin
    ) external onlyOwner {
        bodyContract = ISVGTraitRenderer(_body);
        bellyContract = ISVGTraitRenderer(_belly);
        headContract = ISVGTraitRenderer(_head);
        mouthContract = ISVGTraitRenderer(_mouth);
        specialSkinContract = ISVGTraitRenderer(_specialSkin);
    }
}
