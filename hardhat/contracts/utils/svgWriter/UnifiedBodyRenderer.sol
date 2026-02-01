// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SSTORE2.sol";

/**
 * @title UnifiedBodyRenderer
 * @notice Unified body renderer that handles both color-based body and special skins
 * @dev - render(0) or renderWithColor(color): renders color-based body
 *      - render(1+): renders special skin (bronze=1, silver=2, gold=3, diamond=4, etc.)
 *      Special skins are stored in a mapping of pointers
 */
contract UnifiedBodyRenderer is Ownable {
    // Color body (split at color value for injection)
    address public colorPart1Pointer;
    address public colorPart2Pointer;

    // Special skins (ID -> array of chunk pointers)
    mapping(uint256 => address[]) public skinPointers;
    mapping(uint256 => string) public skinNames;
    uint256 public skinCount;

    constructor(address _colorPart1, address _colorPart2) Ownable(msg.sender) {
        colorPart1Pointer = _colorPart1;
        colorPart2Pointer = _colorPart2;
    }

    /**
     * @notice Renders body with color (for body ID 0)
     * @param color The hex color to use (e.g., "#65b449")
     */
    function renderWithColor(string memory color) external view returns (string memory) {
        bytes memory p1 = SSTORE2.read(colorPart1Pointer);
        bytes memory p2 = SSTORE2.read(colorPart2Pointer);
        return string(abi.encodePacked(p1, color, p2));
    }

    /**
     * @notice Renders special skin by ID (1=bronze, 2=silver, 3=gold, 4=diamond, etc.)
     * @param skinId The skin ID (must be > 0)
     */
    function render(uint256 skinId) external view returns (string memory) {
        require(skinId > 0, "Use renderWithColor for body ID 0");
        require(skinPointers[skinId].length > 0, "Skin not registered");

        address[] memory pointers = skinPointers[skinId];
        bytes memory result;

        for (uint256 i = 0; i < pointers.length; i++) {
            result = abi.encodePacked(result, SSTORE2.read(pointers[i]));
        }

        return string(result);
    }

    /**
     * @notice Returns metadata name for the skin
     * @param skinId The skin ID (0 returns "Body" for color-based)
     */
    function meta(uint256 skinId) external view returns (string memory) {
        if (skinId == 0) {
            return "Body";
        }
        if (bytes(skinNames[skinId]).length > 0) {
            return skinNames[skinId];
        }
        return "Unknown";
    }

    /**
     * @notice Check if a skin ID is valid
     */
    function isValidTrait(uint256 skinId) external view returns (bool) {
        if (skinId == 0) return true; // Color body is always valid
        return skinPointers[skinId].length > 0;
    }

    /**
     * @notice Get total number of registered skins (not including color body)
     */
    function getTraitCount() external view returns (uint256) {
        return skinCount;
    }

    // ============ Owner Functions ============

    /**
     * @notice Set the color body parts
     */
    function setColorParts(address _part1, address _part2) external onlyOwner {
        colorPart1Pointer = _part1;
        colorPart2Pointer = _part2;
    }

    /**
     * @notice Register a special skin
     * @param skinId The skin ID (1=bronze, 2=silver, 3=gold, 4=diamond)
     * @param pointers Array of SSTORE2 pointers for the skin SVG chunks
     * @param name The name of the skin for metadata
     */
    function setSkin(uint256 skinId, address[] calldata pointers, string calldata name) external onlyOwner {
        require(skinId > 0, "Skin ID must be > 0");
        skinPointers[skinId] = pointers;
        skinNames[skinId] = name;
        if (skinId > skinCount) {
            skinCount = skinId;
        }
    }

    /**
     * @notice Batch register multiple skins
     */
    function setSkinsBatch(
        uint256[] calldata skinIds,
        address[][] calldata pointers,
        string[] calldata names
    ) external onlyOwner {
        require(skinIds.length == pointers.length && skinIds.length == names.length, "Length mismatch");
        for (uint256 i = 0; i < skinIds.length; i++) {
            require(skinIds[i] > 0, "Skin ID must be > 0");
            skinPointers[skinIds[i]] = pointers[i];
            skinNames[skinIds[i]] = names[i];
            if (skinIds[i] > skinCount) {
                skinCount = skinIds[i];
            }
        }
    }
}
