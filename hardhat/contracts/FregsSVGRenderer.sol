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
    uint256 public constant TRAIT_SPECIAL_BODY = 4;
    uint256 public constant TRAIT_SPECIAL_MOUTH = 5;
    uint256 public constant TRAIT_SPECIAL_BACKGROUND = 6;
    uint256 public constant TRAIT_SPECIAL_BELLY = 7;
    uint256 public constant TRAIT_SPECIAL_HEAD = 8;

    // Sub-contracts for each trait type
    ISVGTraitRenderer public bodyContract;
    ISVGTraitRenderer public bellyContract;
    ISVGTraitRenderer public headContract;
    ISVGTraitRenderer public mouthContract;
    ISVGTraitRenderer public specialBodyContract;      // renamed from specialSkinContract
    ISVGTraitRenderer public specialMouthContract;
    ISVGTraitRenderer public specialBackgroundContract;
    ISVGTraitRenderer public specialBellyContract;
    ISVGTraitRenderer public specialHeadContract;

    // SVG dimensions and styling (viewBox matches background/1.svg dimensions)
    string public svgHeader = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 617.49 644.18'>";
    string public svgFooter = "</svg>";

    constructor() Ownable(msg.sender) {}

    // ============ Main Render Function ============

    /**
     * @notice Renders the complete SVG for a Freg
     * @dev Renders layers in order: background, body, belly, head, mouth
     *      Each layer can be overridden by a corresponding special trait:
     *      - specialBackground > 0: use special background instead of colored rect
     *      - specialBody > 0: use special body (bronze/silver/gold) instead of body+belly
     *      - specialBelly > 0: use special belly instead of normal belly (only if no specialBody)
     *      - specialHead > 0: use special head instead of normal head
     *      - specialMouth > 0: use special mouth instead of normal mouth
     *      A Freg can have multiple special traits simultaneously
     */
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
    ) external view returns (string memory) {
        // Background layer - use special background or colored rect
        string memory backgroundLayer;
        if (_specialBackground > 0) {
            backgroundLayer = _renderSpecialBackground(_specialBackground);
        } else {
            backgroundLayer = _renderBackground(_bodyColor);
        }

        // Body and belly layers
        string memory bodyLayer;
        string memory bellyLayer;

        if (_specialBody > 0) {
            // Has special body - use special body instead of body+belly
            bodyLayer = _renderSpecialBody(_specialBody);
            bellyLayer = ""; // No belly with special body
        } else {
            // Normal body with color
            bodyLayer = _renderBody(_bodyColor);
            // Use special belly or normal belly
            if (_specialBelly > 0) {
                bellyLayer = _renderSpecialBelly(_specialBelly);
            } else {
                bellyLayer = _renderBelly(_belly);
            }
        }

        // Head layer - use special head or normal head
        string memory headLayer;
        if (_specialHead > 0) {
            headLayer = _renderSpecialHead(_specialHead);
        } else {
            headLayer = _renderHead(_head);
        }

        // Mouth layer - use special mouth or normal mouth
        string memory mouthLayer;
        if (_specialMouth > 0) {
            mouthLayer = _renderSpecialMouth(_specialMouth);
        } else {
            mouthLayer = _renderMouth(_mouth);
        }

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
        } else if (_traitType == TRAIT_SPECIAL_BODY) {
            return specialBodyContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_MOUTH) {
            return specialMouthContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_BACKGROUND) {
            return specialBackgroundContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_BELLY) {
            return specialBellyContract.meta(_traitId);
        } else if (_traitType == TRAIT_SPECIAL_HEAD) {
            return specialHeadContract.meta(_traitId);
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

    function _renderSpecialBody(uint256 _bodyId) internal view returns (string memory) {
        return specialBodyContract.render(_bodyId);
    }

    function _renderSpecialMouth(uint256 _mouthId) internal view returns (string memory) {
        return specialMouthContract.render(_mouthId);
    }

    function _renderSpecialBackground(uint256 _bgId) internal view returns (string memory) {
        return specialBackgroundContract.render(_bgId);
    }

    function _renderSpecialBelly(uint256 _bellyId) internal view returns (string memory) {
        return specialBellyContract.render(_bellyId);
    }

    function _renderSpecialHead(uint256 _headId) internal view returns (string memory) {
        return specialHeadContract.render(_headId);
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

    function setSpecialBodyContract(address _contract) external onlyOwner {
        specialBodyContract = ISVGTraitRenderer(_contract);
    }

    function setSpecialMouthContract(address _contract) external onlyOwner {
        specialMouthContract = ISVGTraitRenderer(_contract);
    }

    function setSpecialBackgroundContract(address _contract) external onlyOwner {
        specialBackgroundContract = ISVGTraitRenderer(_contract);
    }

    function setSpecialBellyContract(address _contract) external onlyOwner {
        specialBellyContract = ISVGTraitRenderer(_contract);
    }

    function setSpecialHeadContract(address _contract) external onlyOwner {
        specialHeadContract = ISVGTraitRenderer(_contract);
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
        address _specialBody,
        address _specialMouth,
        address _specialBackground,
        address _specialBelly,
        address _specialHead
    ) external onlyOwner {
        bodyContract = ISVGTraitRenderer(_body);
        bellyContract = ISVGTraitRenderer(_belly);
        headContract = ISVGTraitRenderer(_head);
        mouthContract = ISVGTraitRenderer(_mouth);
        specialBodyContract = ISVGTraitRenderer(_specialBody);
        specialMouthContract = ISVGTraitRenderer(_specialMouth);
        specialBackgroundContract = ISVGTraitRenderer(_specialBackground);
        specialBellyContract = ISVGTraitRenderer(_specialBelly);
        specialHeadContract = ISVGTraitRenderer(_specialHead);
    }
}
