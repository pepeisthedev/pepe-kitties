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
    uint256 public nextTypeId = 1;  // Track next available type ID

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setRenderContract(uint256 typeId, address contractAddr) external onlyOwner {
        renderContracts[typeId] = contractAddr;
        // Update nextTypeId if needed
        if (typeId >= nextTypeId) {
            nextTypeId = typeId + 1;
        }
    }

    // Add a new render contract and return the assigned type ID
    function addRenderContract(address contractAddr) external onlyOwner returns (uint256 typeId) {
        typeId = nextTypeId;
        renderContracts[typeId] = contractAddr;
        nextTypeId++;
        return typeId;
    }

    // Add a new render contract with a name and return the assigned type ID
    function addRenderContractWithName(address contractAddr, string calldata name) external onlyOwner returns (uint256 typeId) {
        typeId = nextTypeId;
        renderContracts[typeId] = contractAddr;
        traitNames[typeId] = name;
        nextTypeId++;
        return typeId;
    }

    function setRenderContractsBatch(address[] calldata contractAddrs) external onlyOwner {
        for (uint256 i = 0; i < contractAddrs.length; i++) {
            renderContracts[i + 1] = contractAddrs[i]; // Start at typeId 1
        }
        // Update nextTypeId to be after all set contracts
        if (contractAddrs.length + 1 > nextTypeId) {
            nextTypeId = contractAddrs.length + 1;
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

    // Returns the number of registered traits (max valid typeId)
    function getTraitCount() public view returns (uint256) {
        return nextTypeId - 1;
    }

    // Check if a trait ID is valid (has a renderer)
    function isValidTrait(uint256 typeId) public view returns (bool) {
        return renderContracts[typeId] != address(0);
    }
}
