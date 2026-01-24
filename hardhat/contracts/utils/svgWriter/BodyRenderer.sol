// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SSTORE2.sol";

/**
 * @title BodyRenderer
 * @notice Renders the frog body SVG with a customizable color
 * @dev Stores the SVG in two parts split at the color value
 *      Part 1 ends with ".cls-6{fill:", Part 2 starts with ";"
 *      render() concatenates: part1 + color + part2
 */
contract BodyRenderer is Ownable {
    address public part1Pointer;
    address public part2Pointer;

    constructor(address _part1, address _part2) Ownable(msg.sender) {
        part1Pointer = _part1;
        part2Pointer = _part2;
    }

    /**
     * @notice Renders the body SVG with the specified color
     * @param color The hex color to use (e.g., "#65b449")
     */
    function render(string memory color) external view returns (string memory) {
        bytes memory p1 = SSTORE2.read(part1Pointer);
        bytes memory p2 = SSTORE2.read(part2Pointer);

        return string(abi.encodePacked(p1, color, p2));
    }

    /**
     * @notice Alias for ISVGTraitRenderer compatibility
     */
    function renderWithColor(string memory color) external view returns (string memory) {
        return this.render(color);
    }

    /**
     * @notice Required by ISVGTraitRenderer but not used for body
     */
    function render(uint256) external pure returns (string memory) {
        revert("Use render(color) or renderWithColor(color) for body");
    }

    /**
     * @notice Returns metadata for the body
     */
    function meta(uint256) external pure returns (string memory) {
        return "Body";
    }

    function setParts(address _part1, address _part2) external onlyOwner {
        part1Pointer = _part1;
        part2Pointer = _part2;
    }
}
