// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

// Interface for trait sub-contracts
interface ISVGTraitRenderer {
    function render(uint256 traitId) external view returns (string memory);
    function renderWithColor(string memory color) external view returns (string memory);
    function meta(uint256 traitId) external view returns (string memory);
}

contract FregsSVGRenderer is Ownable {
    using Strings for uint256;

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

    // SVG dimensions and styling
    string public svgHeader = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>";
    string public svgFooter = "</svg>";

    constructor() Ownable(msg.sender) {}

    // ============ Main Render Function ============

    /**
     * @notice Renders the complete SVG for a Freg
     * @dev If specialSkin > 0, renders: special_skin + head + mouth
     *      Otherwise renders: body (with color) + belly + head + mouth
     */
    function render(
        string memory _bodyColor,
        uint256 _head,
        uint256 _mouth,
        uint256 _belly,
        uint256 _specialSkin
    ) external view returns (string memory) {
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
        if (_traitType == TRAIT_HEAD && address(headContract) != address(0)) {
            return headContract.meta(_traitId);
        } else if (_traitType == TRAIT_MOUTH && address(mouthContract) != address(0)) {
            return mouthContract.meta(_traitId);
        } else if (_traitType == TRAIT_BELLY && address(bellyContract) != address(0)) {
            return bellyContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_SKIN && address(specialSkinContract) != address(0)) {
            return specialSkinContract.meta(_traitId);
        }

        // Fallback: return trait ID as string
        return string(abi.encodePacked("Trait #", _traitId.toString()));
    }

    // ============ Internal Render Helpers ============

    function _renderBody(string memory _color) internal view returns (string memory) {
        if (address(bodyContract) != address(0)) {
            return bodyContract.renderWithColor(_color);
        }
        // Placeholder body with color
        return string(
            abi.encodePacked(
                "<ellipse cx='200' cy='250' rx='120' ry='140' fill='",
                _color,
                "'/>"
            )
        );
    }

    function _renderBelly(uint256 _bellyId) internal view returns (string memory) {
        if (address(bellyContract) != address(0)) {
            return bellyContract.render(_bellyId);
        }
        // Placeholder belly
        return "<ellipse cx='200' cy='280' rx='60' ry='70' fill='#f5f5dc' opacity='0.8'/>";
    }

    function _renderHead(uint256 _headId) internal view returns (string memory) {
        if (address(headContract) != address(0)) {
            return headContract.render(_headId);
        }
        // Placeholder head with eyes
        return string(
            abi.encodePacked(
                "<circle cx='200' cy='120' r='80' fill='inherit'/>",
                "<circle cx='170' cy='100' r='20' fill='white'/>",
                "<circle cx='230' cy='100' r='20' fill='white'/>",
                "<circle cx='175' cy='105' r='8' fill='black'/>",
                "<circle cx='235' cy='105' r='8' fill='black'/>"
            )
        );
    }

    function _renderMouth(uint256 _mouthId) internal view returns (string memory) {
        if (address(mouthContract) != address(0)) {
            return mouthContract.render(_mouthId);
        }
        // Placeholder mouth
        return "<path d='M 180 140 Q 200 160 220 140' stroke='black' stroke-width='3' fill='none'/>";
    }

    function _renderSpecialSkin(uint256 _skinId) internal view returns (string memory) {
        if (address(specialSkinContract) != address(0)) {
            return specialSkinContract.render(_skinId);
        }

        // Placeholder special skins with gradients
        string memory skinColor;
        string memory gradientId;

        if (_skinId == 1) {
            // Bronze
            skinColor = "#cd7f32";
            gradientId = "bronzeGrad";
        } else if (_skinId == 2) {
            // Silver
            skinColor = "#c0c0c0";
            gradientId = "silverGrad";
        } else {
            // Gold
            skinColor = "#ffd700";
            gradientId = "goldGrad";
        }

        return string(
            abi.encodePacked(
                "<defs><linearGradient id='",
                gradientId,
                "' x1='0%' y1='0%' x2='100%' y2='100%'>",
                "<stop offset='0%' style='stop-color:",
                skinColor,
                ";stop-opacity:1'/>",
                "<stop offset='50%' style='stop-color:white;stop-opacity:0.3'/>",
                "<stop offset='100%' style='stop-color:",
                skinColor,
                ";stop-opacity:1'/>",
                "</linearGradient></defs>",
                "<ellipse cx='200' cy='250' rx='120' ry='140' fill='url(#",
                gradientId,
                ")'/>"
            )
        );
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
