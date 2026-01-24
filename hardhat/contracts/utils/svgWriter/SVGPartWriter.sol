// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./SSTORE2.sol";

contract SVGPartWriter {
    
    event DataStored(address indexed pointer);

    /// @notice Store a single SVG part on-chain and return its pointer
    function store(bytes calldata data) external returns (address) {
        address pointer = SSTORE2.write(data);
        emit DataStored(pointer);
        return pointer;
    }

    /// @notice Store multiple parts at once and return all pointers
    function storeBatch(bytes[] calldata dataParts) external returns (address[] memory pointers) {
        uint256 len = dataParts.length;
        pointers = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            pointers[i] = SSTORE2.write(dataParts[i]);
            emit DataStored(pointers[i]);
        }
    }
}
