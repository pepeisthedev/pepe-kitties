// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/utils/Strings.sol";

interface ISVG {
    function render() external view returns (string memory);
}

contract SVGRouter {
    using Strings for uint256;

    mapping(uint256 => address) public renderContracts;
    mapping(uint256 => string) public traitNames;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setRenderContract(uint256 typeId, address contractAddr) external onlyOwner {
        renderContracts[typeId] = contractAddr;
    }

    function setRenderContractsBatch(address[] calldata contractAddrs) external onlyOwner {
        for (uint256 i = 0; i < contractAddrs.length; i++) {
            renderContracts[i + 1] = contractAddrs[i]; // Start at typeId 1
        }
    }

    function setRenderContractsBatchWithTypeIds(
        uint8[] calldata typeIds,
        address[] calldata contractAddrs
    ) external onlyOwner {
        require(typeIds.length == contractAddrs.length, "Length mismatch");
        for (uint256 i = 0; i < typeIds.length; i++) {
            renderContracts[typeIds[i]] = contractAddrs[i];
        }
    }

    function setTraitName(uint256 typeId, string calldata name) external onlyOwner {
        traitNames[typeId] = name;
    }

    function setTraitNamesBatch(string[] calldata names) external onlyOwner {
        for (uint256 i = 0; i < names.length; i++) {
            traitNames[i + 1] = names[i]; // Start at typeId 1
        }
    }

    function render(uint256 typeId) public view returns (string memory) {
        require(renderContracts[typeId] != address(0), "Type not set");
        return ISVG(renderContracts[typeId]).render();
    }

    function meta(uint256 typeId) public view returns (string memory) {
        if (bytes(traitNames[typeId]).length > 0) {
            return traitNames[typeId];
        }
        return string(abi.encodePacked("Type ", typeId.toString()));
    }
}
